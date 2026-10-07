"""Compare browser behavior against a pre-refactor game.js.

Requires Python playwright and Chromium. Run from the repository:
  git show HEAD:game.js > /tmp/rps-game-before.js  # before committing the refactor
  python3 tests/refactor_regression.py /tmp/rps-game-before.js
No server is needed; both versions use the same HTML and intercepted script.
"""

import itertools
import json
from pathlib import Path
import sys

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
DETERMINISTIC = """
let seed = 42, uuid = 0;
Math.random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
crypto.randomUUID = () => `participant-${++uuid}`;
const OriginalDate = Date;
window.Date = class extends OriginalDate {
  constructor(...args) { super(...(args.length ? args : ['2026-10-07T00:00:00Z'])); }
  static now() { return 1791331200000; }
};
"""


def snapshot(page):
    return page.evaluate("""() => ({
      html: document.body.innerHTML,
      inputs: Array.from(document.querySelectorAll('input,select'), input =>
        [input.id, input.type, input.value, input.checked, input.disabled]),
      state: {gameConfig, participants, teams, roundNumber, roundHistory,
        tournamentRoundNumber, tournamentRounds, playerThrows, teamRepresentatives,
        tournamentFrozen, currentEquipmentDiscards}
    })""")


def run(browser, script, team=False, rule='normal', mode='none', computer=False):
    context = browser.new_context(accept_downloads=True)
    page = context.new_page()
    errors, dialogs, captures = [], [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('dialog', lambda dialog: (dialogs.append(dialog.message), dialog.accept()))
    page.add_init_script(DETERMINISTIC)
    page.route('http://rps.test/**', lambda route: route.fulfill(
        body=script if route.request.url.endswith('game.js') else ROOT.joinpath('index.html').read_text(),
        content_type='text/javascript' if route.request.url.endswith('game.js') else 'text/html'))
    page.goto('http://rps.test/')
    captures.append(snapshot(page))
    page.locator('#playerCount').fill('4' if team else '2')
    if team:
        page.locator('#teamMode').check()
    page.locator('#equipmentRule').select_option(rule)
    page.locator('#eliminationMode').select_option(mode)
    if computer:
        page.locator('input[name="initialEquipmentDiscardMode"][value="computer"]').check()
    page.locator('#gameTheme').fill('回歸測試')
    page.locator('#createGameBtn').click()
    if team:
        for index in (2, 3):
            page.locator('.participant-card').nth(index).locator('.participant-controls select').select_option('2')
        for index in range(2):
            page.locator('.team-control').nth(index).locator('input[type="checkbox"]').check()
    else:
        for index in range(2):
            page.locator('.participant-card').nth(index).locator('.participant-controls input[type="checkbox"]').check()
    captures.append(snapshot(page))
    # Controlled throws guarantee a win/loss, exercising penalties and equipment.
    for index, title in enumerate(('石頭', '剪刀')):
        page.locator('.operation-card').nth(index).locator(f'button[title="{title}"]').click()
    page.locator('#startRoundBtn').click()
    page.wait_for_function('!roundBusy && roundNumber === 1')
    captures.append(snapshot(page))
    while page.locator('#equipmentDiscardPanel').count():
        panel = page.locator('#equipmentDiscardPanel')
        panel.locator('input[type="radio"]:enabled').first.check()
        panel.get_by_role('button', name='脫', exact=True).first.click()
        if rule == 'unlimited' and page.locator('#equipmentDiscardPanel').count():
            page.locator('#equipmentDiscardPanel').get_by_role('button', name='夠了', exact=True).first.click()
    captures.append(snapshot(page))
    # Exercise the automatic-save path without requesting a real folder grant.
    saved = page.evaluate("""async () => {
      const calls = [];
      let savedData;
      saveDirectoryHandle = {getFileHandle: async (name, options) => {
        calls.push([name, options]);
        return {createWritable: async () => ({
          write: async text => {savedData = JSON.parse(text); calls.push('write');},
          close: async () => {calls.push('close');}
        })};
      }};
      gameConfig.saveResults = true;
      await saveGameState();
      gameConfig.saveResults = false;
      saveDirectoryHandle = null;
      return {calls, savedData};
    }""")
    assert saved['calls'][-2:] == ['write', 'close']
    captures.append(saved)
    # Exercise download and import, retaining the exact public JSON schema.
    with page.expect_download() as download_info:
        page.get_by_role('button', name='匯出 JSON 到檔案', exact=True).click()
    download = download_info.value
    data = Path(download.path()).read_bytes()
    captures.append(json.loads(data))
    page.locator('input[type="file"][accept=".json,application/json"]').set_input_files(
        {'name': 'record.json', 'mimeType': 'application/json', 'buffer': data})
    page.wait_for_function('saveFileName === "record.json"')
    captures.append(snapshot(page))
    page.locator('#resetCurrentRoundBtn').click()
    page.wait_for_function('!roundBusy && roundNumber === 0')
    captures.append(snapshot(page))
    page.locator('#currentRoundName').fill('預賽')
    page.locator('#saveCurrentRoundNameBtn').click()
    page.locator('#createNextRoundBtn').click()
    page.locator('#nextPlayerCount').fill('2')
    page.locator('#nextRoundName').fill('決賽')
    page.locator('#confirmNextRoundBtn').click()
    page.wait_for_function('tournamentRoundNumber === 2')
    captures.append(snapshot(page))
    page.locator('.round-tab').first.click()
    captures.append(snapshot(page))
    page.locator('.round-tab').last.click()
    page.locator('#deleteCurrentRoundBtn').click()
    page.wait_for_function('tournamentRoundNumber === 1')
    captures.append(snapshot(page))
    page.locator('#createNextRoundBtn').click()
    page.locator('#nextPlayerCount').fill('2')
    page.locator('#importExistingParticipants').check()
    page.locator('#inheritStats').check()
    for checkbox in page.locator('.source-participant-checkbox').all():
        checkbox.check()
    page.locator('#confirmNextRoundBtn').click()
    page.wait_for_function('tournamentRoundNumber === 2')
    page.locator('#freezeTournamentSummaryBtn').click()
    captures.append(snapshot(page))
    assert not errors, errors
    context.close()
    return captures, dialogs


def result_matrix(browser, script):
    context = browser.new_context()
    page = context.new_page()
    page.route('http://rps.test/**', lambda route: route.fulfill(
        body=script if route.request.url.endswith('game.js') else ROOT.joinpath('index.html').read_text()))
    page.goto('http://rps.test/')
    combinations = [list(values) for count in range(0, 6)
                    for values in itertools.product(('rock', 'paper', 'scissors'), repeat=count)]
    results = page.evaluate("""combinations => combinations.map(fists => {
      const items = fists.map((fist, id) => ({id}));
      const throws = Object.fromEntries(fists.map((fist, id) => [id, fist]));
      return [calculateNormalResults(items, throws), calculateTeamResults(items, throws)];
    })""", combinations)
    context.close()
    return results


def main():
    baseline = Path(sys.argv[1]).read_text()
    current = ROOT.joinpath('game.js').read_text()
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
        assert result_matrix(browser, baseline) == result_matrix(browser, current)
        print('PASS: 364 throw combinations for individual and team rules')
        for scenario in [
            (False, 'normal', 'none', False),
            (False, 'unlimited', 'loss', False),
            (False, 'normal', 'equipment', True),
            (True, 'normal', 'loss', False),
            (True, 'unlimited', 'equipment', True),
        ]:
            before = run(browser, baseline, *scenario)
            after = run(browser, current, *scenario)
            assert before == after, f'Behavior changed: {scenario}'
            print(f'PASS: browser flow {scenario} ({len(before[0])} checkpoints)')
        browser.close()


if __name__ == '__main__':
    main()
