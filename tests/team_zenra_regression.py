"""Run: python3 tests/team_zenra_regression.py (requires Playwright/Chromium)."""
from playwright.sync_api import sync_playwright
from settlement_regression import open_game

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    page = open_game(browser, team=True, rule='normal', mode='equipment')
    page.evaluate('''() => {
      gameConfig.emptyEquipmentLimit = 100;
      participants.forEach(p => { p.eliminated = false; p.equipment = []; });
      teams.forEach(t => { t.eliminated = false; });
      renderOperationPanel();
    }''')
    assert page.locator('.operation-card').count() == 0
    assert page.evaluate('isRoundStopped()')
    # A mixed team remains eligible, including its existing zero-item representative.
    page.evaluate('''() => {
      teams.forEach(t => {
        const members = participants.filter(p => p.teamId === t.id);
        members[members.length - 1].equipment = ['上衣'];
        teamRepresentatives[`team-${t.id}`] = members[0].id;
        playerThrows[`team-${t.id}`] = 'rock';
      });
      renderOperationPanel();
    }''')
    assert page.locator('.operation-card').count() == 2
    assert not page.evaluate('isRoundStopped()')
    page.evaluate('startTeamRound()')
    assert page.evaluate('roundNumber === 2')
    # A fully stripped team neither appears nor blocks validation with stale inputs.
    page.evaluate('''() => {
      participants.filter(p => p.teamId === teams[0].id).forEach(p => p.equipment = []);
      delete teamRepresentatives[`team-${teams[0].id}`];
      renderOperationPanel();
    }''')
    assert page.locator('.operation-card').count() == 1
    assert page.evaluate('isRoundStopped()')
    page.evaluate('startTeamRound()')
    assert page.evaluate('roundNumber === 2')
    # With two other teams alive, the stripped team is absent from actual results.
    page.evaluate('''() => {
      const extra = {...teams[1], id: 999, name: '第三隊'};
      teams.push(extra);
      participants.push({...participants.find(p => p.teamId === teams[1].id),
        id: 999, teamId: 999, equipment: ['上衣']});
      teamRepresentatives['team-999'] = 999;
      playerThrows['team-999'] = 'rock';
      playerThrows[`team-${teams[1].id}`] = 'rock';
      renderOperationPanel();
    }''')
    page.evaluate('startTeamRound()')
    assert page.evaluate('roundNumber === 3')
    assert page.evaluate('!Object.hasOwn(roundHistory[roundHistory.length - 1].throws, teams[0].id)')
    page.evaluate('teams.pop(); participants.pop();')
    for mode in ('none', 'loss'):
        page.evaluate('''mode => {
          gameConfig.eliminationMode = mode;
          renderOperationPanel();
        }''', mode)
        assert page.locator('.operation-card').count() == 2
    page.close()
    browser.close()
print('Team ZENRA regression checks passed')
