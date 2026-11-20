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
    page.route('http://rps.test/**', lambda route: route.fulfill(
        body=ROOT.joinpath('game.js' if route.request.url.endswith('game.js') else 'index.html').read_text(),
        content_type='text/javascript' if route.request.url.endswith('game.js') else 'text/html'))
    page.goto('http://rps.test/')
    page.locator('#equipmentRule').select_option(rule)
    page.locator('#eliminationMode').select_option(mode)
    if team:
        page.locator('#teamMode').check()
    page.locator('#createGameBtn').click()
    # Use legal, deterministic equipment to exercise both multi-item and last-item paths.
    page.evaluate('''naked => {
      participants.forEach(p => {
        p.initialEquipment = naked ? [] : ['上衣', '褲子'];
        p.equipment = [...p.initialEquipment];
      });
      renderParticipantSettings(); renderOperationPanel();
    }''', naked)
    return page


def assert_stopped(page, completed):
    assert page.locator('#startRoundBtn').is_disabled()
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
            assert page.locator('#startRoundBtn').is_enabled()
            page.locator('.round-tab').first.click()
            assert_stopped(page, True)
            page.locator('#resetCurrentRoundBtn').click()
            assert page.locator('#startRoundBtn').is_enabled()
            assert page.locator('#equipmentSettlementStatus').count() == 0
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
        browser.close()


if __name__ == '__main__':
    main()
