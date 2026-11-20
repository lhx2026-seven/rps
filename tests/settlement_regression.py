"""Browser checks for final unlimited/no-elimination settlement.

Run: python3 tests/settlement_regression.py
Requires Python Playwright and /usr/bin/chromium.
"""
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


def open_game(browser, team=False, rule='unlimited', mode='none', naked=False):
    page = browser.new_page(accept_downloads=True)
    page.on('dialog', lambda dialog: dialog.accept())
    def serve(route):
        name = route.request.url.rsplit('/', 1)[-1]
        name = name if name in ('game.js', 'style.css') else 'index.html'
        route.fulfill(body=ROOT.joinpath(name).read_text(), content_type={
            'game.js': 'text/javascript', 'style.css': 'text/css', 'index.html': 'text/html'}[name])
    page.route('http://rps.test/**', serve)
    page.goto('http://rps.test/')
    page.locator('#equipmentRule').select_option(rule)
    page.locator('#eliminationMode').select_option(mode)
    if team:
        page.locator('#teamMode').check()
    page.locator('#createGameBtn').click()
    assert page.locator('#settleEquipmentBtn').is_disabled()
    assert page.locator('#settleEquipmentBtn').evaluate("el => getComputedStyle(el).backgroundColor") == 'rgb(221, 221, 221)'
    assert page.evaluate("""async () => {
      await settleEquipment();
      return !hasPendingEquipment() && !isFinalEquipmentSettlement();
    }""")
    page.evaluate("""async () => {
      participants.forEach((p, i) => {
        p.controlled = true;
        if (gameConfig.teamMode) p.teamId = teams[i % teams.length].id;
        playerThrows[p.id] = 'rock';
      });
      teams.forEach(t => {
        t.controlled = true;
        teamRepresentatives[`team-${t.id}`] = participants.find(p => p.teamId === t.id).id;
        playerThrows[`team-${t.id}`] = 'rock';
      });
      await startRound();
    }""")
    assert page.evaluate('roundNumber === 1')
    if mode == 'none':
        assert page.locator('#settleEquipmentBtn').is_enabled()
    # Use legal, deterministic equipment to exercise both multi-item and last-item paths.
    page.evaluate('''naked => {
      participants.forEach((p, i) => {
        if (gameConfig.teamMode) p.teamId = teams[i % teams.length].id;
        p.initialEquipment = naked ? [] : ['上衣', '褲子'];
        p.equipment = [...p.initialEquipment];
      });
      renderParticipantSettings(); renderOperationPanel();
    }''', naked)
    return page


def assert_stopped(page, completed):
    assert page.locator('#roundOutcomeSummary').count() == 0
    assert page.locator('#startRoundBtn').is_disabled()
    assert page.locator('#startRoundBtn').evaluate("el => getComputedStyle(el).backgroundColor") == 'rgb(221, 221, 221)'
    assert page.locator('#settleEquipmentBtn').is_disabled()
    assert page.locator('#equipmentSettlementStatus').inner_text() == (
        '本回合已結束。' if completed else '本回合已停止，請完成衣物結算。')
    assert page.evaluate('''async () => {
      const before = JSON.stringify([roundNumber, roundHistory, participants]);
      await startRound(); await settleEquipment();
      return before === JSON.stringify([roundNumber, roundHistory, participants]);
    }''')


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
        for team in (False, True):
            page = open_game(browser, team=team)
            page.locator('#settleEquipmentBtn').click()
            assert_stopped(page, False)
            # First player chooses zero items; the second removes one then finishes.
            page.get_by_role('button', name='夠了', exact=True).first.click()
            assert_stopped(page, False)
            panel = page.locator('#equipmentDiscardPanel')
            panel.locator('input[type="radio"]:enabled').first.check()
            panel.get_by_role('button', name='脫', exact=True).click()
            assert_stopped(page, False)
            page.get_by_role('button', name='夠了', exact=True).click()
            assert_stopped(page, True)
            assert page.evaluate('participants.every(p => !p.eliminated)')
            assert page.evaluate('participants[0].equipment.length === 2 && participants[1].equipment.length === 1')
            # Export/import and round navigation must preserve the stopped state.
            with page.expect_download() as info:
                page.get_by_role('button', name='匯出 JSON 到檔案', exact=True).click()
            data = Path(info.value.path()).read_bytes()
            page.locator('input[type="file"][accept=".json,application/json"]').set_input_files(
                {'name': 'settled.json', 'mimeType': 'application/json', 'buffer': data})
            page.wait_for_function('saveFileName === "settled.json"')
            assert_stopped(page, True)
            page.locator('#createNextRoundBtn').click()
            page.locator('#nextPlayerCount').fill('2')
            page.locator('#confirmNextRoundBtn').click()
            page.wait_for_function('tournamentRoundNumber === 2')
            assert page.evaluate('!isFinalEquipmentSettlement()')
            assert page.locator('#settleEquipmentBtn').is_disabled()
            page.evaluate('''() => {
              if (gameConfig.teamMode) participants.forEach((p, i) => p.teamId = teams[i % teams.length].id);
              renderOperationPanel();
            }''')
            assert page.locator('#startRoundBtn').is_enabled()
            page.locator('.round-tab').first.click()
            assert_stopped(page, True)
            page.locator('#resetCurrentRoundBtn').click()
            assert page.locator('#startRoundBtn').is_enabled()
            assert page.locator('#equipmentSettlementStatus').count() == 0
            assert page.locator('#settleEquipmentBtn').is_disabled()
            page.close()
            print(f'PASS: final settlement, persistence, next round and reset (team={team})')

        for naked in (False, True):
            page = open_game(browser, naked=naked)
            page.locator('#settleEquipmentBtn').click()
            # Fully stripping automatically completes, including players already naked.
            while page.locator('#equipmentDiscardPanel').count():
                panel = page.locator('#equipmentDiscardPanel')
                panel.locator('input[type="radio"]:enabled').first.check()
                panel.get_by_role('button', name='脫', exact=True).first.click()
            assert_stopped(page, True)
            page.close()
            print(f'PASS: no remaining equipment (initially naked={naked})')

        page = open_game(browser, rule='normal')
        page.locator('#settleEquipmentBtn').click()
        while page.get_by_role('button', name='夠了', exact=True).count():
            page.get_by_role('button', name='夠了', exact=True).first.click()
        assert page.locator('#startRoundBtn').is_enabled()
        assert page.locator('#equipmentSettlementStatus').count() == 0
        page.close()
        print('PASS: normal-rule settlement remains repeatable')
        for scenario in ('loss', 'team-loss', 'equipment', 'few-players', 'few-teams'):
            page = open_game(browser, team=scenario in ('team-loss', 'few-teams'))
            dialogs = []
            page.on('dialog', lambda dialog: dialogs.append(dialog.message))
            page.evaluate("""scenario => {
              // Keep three competitors for threshold checks, so the threshold alone stops START.
              const extra = {...participants[0], id: 3, participantKey: 'extra',
                equipment: ['上衣'], initialEquipment: ['上衣'], equipmentHistory: []};
              participants.push(extra);
              if (gameConfig.teamMode) {
                teams.push({...teams[0], id: 3, name: '第三隊'});
                participants.forEach((p, i) => p.teamId = i + 1);
              }
              if (scenario === 'loss') {
                gameConfig.eliminationMode = 'loss'; gameConfig.lossLimit = 2;
                participants[0].roundLosses = 1;
                applyNormalResults({1: 'loss'});
                participants.forEach(p => p.pendingEquipmentLoss = false);
              } else if (scenario === 'team-loss') {
                gameConfig.eliminationMode = 'loss'; gameConfig.lossLimit = 2;
                teams[0].losses = 1;
                applyTeamResults(teams, {1: 'loss'});
                participants.forEach(p => p.pendingEquipmentLoss = false);
              } else if (scenario === 'equipment') {
                gameConfig.eliminationMode = 'equipment'; gameConfig.emptyEquipmentLimit = 1;
                participants[0].equipment = [];
                eliminateFullyStrippedParticipants();
              } else if (scenario === 'few-players') {
                participants.slice(1).forEach(p => p.eliminated = true);
              } else {
                teams.slice(1).forEach(t => t.eliminated = true);
              }
              renderOperationPanel();
            }""", scenario)
            assert page.locator('#startRoundBtn').is_disabled(), scenario
            assert page.evaluate("""async () => {
              const before = JSON.stringify([roundNumber, roundHistory, participants, teams]);
              await startRound(); renderOperationPanel(); renderEquipmentDiscardPanel();
              return before === JSON.stringify([roundNumber, roundHistory, participants, teams]);
            }"""), scenario
            assert page.locator('#startRoundBtn').is_disabled(), scenario
            # Exercise the original per-hand notices before rendering the final summary.
            page.evaluate("""scenario => {
              const eliminated = participants.filter(p => p.eliminated);
              if (gameConfig.teamMode) {
                renderTeamResults([], {}, {}, {eliminatedTeams: teams.filter(t => t.eliminated)});
              } else {
                renderNormalResults([], {}, {}, eliminated);
              }
              checkGameEnd(); checkGameEnd();
            }""", scenario)
            assert page.locator('#resultList .round-elimination-notice').count() == 0
            summary = page.locator('#roundOutcomeSummary')
            assert summary.count() == 1, scenario
            assert '本回合已結束' not in summary.inner_text()
            assert page.locator('#equipmentSettlementStatus').count() == 0
            expected = page.evaluate("""() => ({
              winners: gameConfig.teamMode
                ? teams.filter(t => !t.eliminated && participants.some(p => p.teamId === t.id && !p.eliminated)).map(t => t.name)
                : participants.filter(isParticipantEligibleToAct).map(p => p.name),
              eliminated: participants.filter(p => p.eliminated).map(p => p.name)
            })""")
            assert ('獲勝隊伍：' if scenario in ('team-loss', 'few-teams') else '獲勝者：') + ('、'.join(expected['winners']) or '無') in summary.inner_text()
            assert '淘汰者：' + ('、'.join(expected['eliminated']) or '無') in summary.inner_text()
            assert page.locator('#resultList').inner_text().count('淘汰者：') == 1
            assert not dialogs, dialogs
            page.close()
            print(f'PASS: START stays locked without alerts ({scenario})')
        browser.close()


if __name__ == '__main__':
    main()
