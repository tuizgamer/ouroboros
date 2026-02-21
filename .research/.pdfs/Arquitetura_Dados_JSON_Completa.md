## 1. O Personagem Base (Database do Servidor)

### Esta e a fundacao do sistema (inspirada no modelo Naruto Arena + Motor Ouroboros). O JSON possui campos 'Html'

### para facilitar a renderizacao no WebApp, a logica do motor separada do texto, a capacidade de ter uma passiva 'null'

### (opcional) e o slot dinâmico para a 5a Habilidade de linhagem com a tag 'allowedCategories'.

#### {

"id": "char_extrator_01",
"name": "Taurus, o Rompe-Cascos",
"nameHtml": "<b>Taurus</b>, o Rompe-Cascos",
"lineage": "Extratores",
"role": "Tanque / Sentinela",
"energyAffinity": "Red",
"baseHp": 100,
"description": "Lider veterano dos Extratores, converteu seu exotraje em uma fortaleza...",

"passive": {
"name": "Passiva: Nucleo Estavel",
"nameHtml": "<b>Passiva:</b> Nucleo Estavel",
"descriptionHtml": "Possui 5 de <span class='kw-armor'>Armadura</span> inquebravel.",
"classes": ["Passive", "Unpierceable"],
"effects": [{ "type": "armor", "value": 5, "isPermanent": true }]
},

"skills": [
{
"id": "skill_taurus_01",
"nameHtml": "Marreta Hidraulica",
"descriptionHtml": "Causa 25 de dano. Se o alvo tiver <span class='kw-armor'>Armadura</span>, +10 dano.",
"energy": ["Red", "White"],
"classes": ["KNT", "ACT", "Melee"],
"cooldown": 0,
"skillNotes": ["Dano adicional calculado antes da reducao da armadura do alvo."],
"logic": {
"baseDamage": 25,
"bonusDamage": { "condition": "target_has_armor", "value": 10 }
}
},
{
"id": "skill_taurus_02",
"nameHtml": "Blindagem Reativa",
"energy": ["Red"],
"classes": ["INST", "Buff"],
"cooldown": 2,
"logic": {
"status": [
{ "type": "Armor", "value": 10, "duration": 2 },
{ "type": "Sentinel", "duration": 2 }
]
}
}
// ... (Habilidades 3 e 4 omitidas para brevidade, mas seguem a mesma estrutura)
],

"lineageSkillSlot": {
"slotName": "Habilidade de Linhagem",
"allowedCategories": [
"Extratores",
"Universal",
"Hibrido_Extratores_Neon",
"Hibrido_Herdeiros_Extratores"


#### ]

#### }

#### }


## 2. O Esquadrao do Jogador (PlayerLoadout)

### Quando o jogador esta no Lobby, o front-end gera este JSON contendo as 3 escolhas de personagens e os IDs das

### respectivas 5as habilidades escolhidas. O servidor entao validara este JSON.

#### {

"playerId": "user_99283",
"squadName": "Defesa Absoluta",
"team": [
{
"characterId": "char_extrator_01", // Taurus
"equippedLineageSkillId": "skill_lin_sustento_forja"
},
{
"characterId": "char_neon_02", // Glitch
"equippedLineageSkillId": "skill_lin_sobrescrita"
},
{
"characterId": "char_herdeiro_03", // Nyx
"equippedLineageSkillId": "skill_uni_cambio_rapido" // Habilidade Universal
}
]
}

## 3. O Estado de Combate (MatchState)

### Ao iniciar a partida, o servidor funde o Personagem Base com o Loadout do Jogador. A 5a habilidade (Ex: Sustento de

### Forja) e injetada no array 'skills', ganhando a flag 'isLineageSkill: true' para que a UI saiba que deve adicionar a borda

### especial.

#### {

"inMatchId": "p1_char_1",
"name": "Taurus, o Rompe-Cascos",
"passive": { "name": "Passiva: Nucleo Estavel" /* ... */ },
"skills": [
{ "name": "Marreta Hidraulica" /* ... */ },
{ "name": "Blindagem Reativa" /* ... */ },
{ "name": "Terremoto Industrial" /* ... */ },
{ "name": "Muro de Ferro" /* ... */ },

// INJECAO DA 5a HABILIDADE:
{
"id": "skill_lin_sustento_forja",
"nameHtml": "<span class='kw-lineage'>Sustento de Forja</span>",
"descriptionHtml": "Consome 1 energia Vermelha para restaurar 10 de Armadura.",
"energy": ["Red"],
"classes": ["INST", "Buff"],
"isLineageSkill": true,
"logic": {
"status": [
{ "type": "Armor", "value": 10, "duration": 0 }
]
}
}
]
}

