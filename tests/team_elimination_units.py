"""Run: python3 tests/team_elimination_units.py (Playwright + Chromium)."""
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
SETUP='''() => {
 gameConfig={...gameConfig,teamMode:true,teamEquipmentSolidarity:true,eliminationMode:'loss',lossLimit:2,emptyEquipmentLimit:2,lossEliminationUnit:'person',equipmentEliminationUnit:'team',equipmentRule:'normal',equipmentDiscardMode:'manual'};
 teams=[1,2,3].map(id=>({id,name:'隊'+id,wins:0,losses:0,ties:0,eliminated:false}));
 participants=Array.from({length:6},(_,i)=>({id:i+1,participantKey:'p'+i,name:'人'+i,teamId:Math.floor(i/2)+1,wins:0,losses:0,roundLosses:0,ties:0,eliminated:false,initialEquipment:['上衣'],equipment:['上衣'],equipmentHistory:[],pendingEquipmentLoss:false}));
 teamRepresentatives={'team-1':1,'team-2':3,'team-3':5};roundHistory=[];
 document.querySelectorAll('input[name=equipmentDiscardMode]').forEach(e=>e.checked=e.value==='manual');
}'''
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=b.new_page();errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('dialog',lambda d:d.accept())
 def serve(route):
  name=route.request.url.rsplit('/',1)[-1];name=name if name in ['game.js','style.css'] else 'index.html'
  route.fulfill(body=(ROOT/name).read_text(),content_type={'game.js':'text/javascript','style.css':'text/css','index.html':'text/html'}[name])
 page.route('http://units.test/**',serve);page.goto('http://units.test/')
 page.locator('#eliminationMode').select_option('loss')
 assert not page.locator('#lossEliminationUnit').is_visible()
 page.locator('#teamMode').check();assert page.locator('#lossEliminationUnit').is_visible()
 page.locator('#teamEquipmentSolidarity').uncheck();assert not page.locator('#lossEliminationUnit').is_visible()
 page.locator('#teamEquipmentSolidarity').check()
 page.locator('#lossEliminationUnit').select_option('person')
 page.locator('#equipmentEliminationUnit').select_option('team',force=True)
 page.locator('#playerCount').fill('6');page.locator('#createGameBtn').click()
 assert page.evaluate("gameConfig.lossEliminationUnit==='person' && gameConfig.equipmentEliminationUnit==='team'")
 page.evaluate(SETUP)
 page.evaluate("applyTeamResults([teams[0]],{1:'loss'})")
 page.evaluate("teamRepresentatives['team-1']=2;applyTeamResults([teams[0]],{1:'loss'})")
 assert page.evaluate('teams[0].losses===2 && !teams[0].eliminated && participants.every(p=>!p.eliminated) && !lossEliminationReached()')
 page.evaluate("teamRepresentatives['team-1']=1;applyTeamResults([teams[0]],{1:'loss'})")
 assert page.evaluate('participants[0].eliminated && !participants[1].eliminated && !teams[0].eliminated && lossEliminationReached()')
 page.evaluate(SETUP);page.evaluate("gameConfig.lossEliminationUnit='team';applyTeamResults([teams[0]],{1:'loss'});teamRepresentatives['team-1']=2;applyTeamResults([teams[0]],{1:'loss'})")
 assert page.evaluate('teams[0].eliminated && participants[0].eliminated && participants[1].eliminated && !participants[2].eliminated')
 page.evaluate(SETUP)
 page.evaluate("gameConfig.eliminationMode='equipment';participants[0].equipment=[];participants[2].equipment=[];eliminateFullyStrippedParticipants()")
 assert page.evaluate('getStrippedTeamIds().size===0 && !equipmentEliminationReached() && participants.every(p=>!p.eliminated)')
 page.evaluate("participants[1].equipment=[];eliminateFullyStrippedParticipants();teams.push({id:4,name:'空隊',eliminated:false})")
 assert page.evaluate('getStrippedTeamIds().size===1 && !getStrippedTeamIds().has(4) && !equipmentEliminationReached() && participants.every(p=>!p.eliminated)')
 page.evaluate("participants[3].pendingEquipmentLoss=true;eliminateFullyStrippedParticipants()")
 assert page.evaluate('!equipmentEliminationReached() && !participants[3].eliminated && participants[3].equipment.length===1')
 page.evaluate("participants[3].equipment=[];window.newlyOut=eliminateFullyStrippedParticipants()")
 assert page.evaluate('equipmentEliminationReached() && newlyOut.length===4 && teams[0].eliminated && teams[1].eliminated && !teams[2].eliminated && !teams[3].eliminated && !participants[3].pendingEquipmentLoss')
 page.evaluate(SETUP)
 page.evaluate("gameConfig.eliminationMode='equipment';gameConfig.equipmentEliminationUnit='person';participants[0].equipment=[];participants[2].equipment=[];eliminateFullyStrippedParticipants()")
 assert page.evaluate('participants[0].eliminated && participants[2].eliminated && !participants[1].eliminated && !participants[3].eliminated && teams.every(t=>!t.eliminated)')
 page.evaluate(SETUP);page.evaluate("gameConfig.teamEquipmentSolidarity=false;gameConfig.lossEliminationUnit='team'")
 assert not page.evaluate("usesTeamElimination('loss')")
 page.evaluate('delete gameConfig.lossEliminationUnit');assert page.evaluate("usesTeamElimination('loss')")
 page.evaluate(SETUP)

 page.evaluate("gameConfig.lossEliminationUnit='person';gameConfig.equipmentEliminationUnit='team';saveCurrentTournamentRoundSnapshot();syncTournamentRoundToInterface();openNextTournamentRoundSettings()")
 assert page.locator('#nextLossEliminationUnit').input_value()=='person'
 assert page.locator('#nextEquipmentEliminationUnit').input_value()=='team'
 page.locator('#nextEliminationMode').select_option('equipment')
 assert page.locator('#nextEquipmentEliminationUnit').is_visible()
 assert page.locator('#nextEmptyEquipmentLimitBox .setting-title').inner_text()=='淘汰隊伍數'
 page.locator('#nextTeamEquipmentSolidarity').uncheck()
 assert not page.locator('#nextEquipmentEliminationUnit').is_visible()
 page.locator('#nextTeamEquipmentSolidarity').check()
 page.locator('#nextLossEliminationUnit').select_option('team',force=True)
 page.locator('#nextEquipmentEliminationUnit').select_option('team')
 page.locator('#createNewParticipants').check()
 page.locator('#nextPlayerCount').fill('6')
 page.locator('#confirmNextRoundBtn').click()
 page.wait_for_function('tournamentRoundNumber === 2')
 assert page.evaluate("gameConfig.lossEliminationUnit==='team' && gameConfig.equipmentEliminationUnit==='team'")
 assert page.evaluate("tournamentRounds.find(r=>r.tournamentRoundNumber===2).gameConfig.equipmentEliminationUnit==='team'")
 page.evaluate("window.unitsExport=JSON.stringify({gameConfig,participants,teams,roundNumber,roundHistory,tournamentRoundNumber,tournamentRounds})")
 page.evaluate("gameConfig.lossEliminationUnit='person';gameConfig.equipmentEliminationUnit='person';importGameData({target:{files:[new File([unitsExport],'units.json',{type:'application/json'})],value:''}})")
 page.wait_for_function("gameConfig.equipmentEliminationUnit==='team'")
 assert page.locator('#equipmentEliminationUnit').input_value()=='team'
 page.evaluate('resetCurrentRound()')
 page.wait_for_function('roundBusy===false')
 assert page.evaluate("gameConfig.equipmentEliminationUnit==='team' && participants.every(p=>!p.eliminated && p.roundLosses===0) && teams.every(t=>t.losses===0)")
 assert not errors,errors
 b.close()
 print('PASS: unit visibility, initial config, representative rotation, personal/team losses, unique-team ZENRA, solidarity, pending cleanup, legacy defaults')
