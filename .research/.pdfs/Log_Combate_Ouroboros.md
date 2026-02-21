## 1. Exemplo Narrativo de Turno Completo (Turno 4)

### Cenario de Batalha

- Equipa A: Taurus, Zero e Vesper.
- Equipa B: Glitch, Jax e Malakor.
- Estado: Turno 4 (Energia de Pureza Branca: 3 para cada jogador).
- Baliza Ativa (Equipa A): Coracao de Ferro (+5 de dano Cinetico).

### Fase de Planejamento (Oculta)

#### Jogador A Seleciona:

#### 1. Taurus: Blindagem Reativa [INST]

#### 2. Zero: Lamina de Dados [ACT] em Glitch

#### 3. Vesper: Passa o turno (Garda energia para reciclagem)

#### Jogador B Seleciona:

#### 1. Glitch: Blackout [CTRL] em Zero

#### 2. Jax: Carga de Detonacao [ACT] em Vesper

#### 3. Malakor: Ritual de Sangue [AFL] (Ja ativo em Vesper de um turno anterior)

### Fase de Execucao (The Stack)

#### Camada 1 (Passivo): A Baliza Coracao de Ferro (Equipa A) concede +5 dano Cinetico para a equipa A.

#### Camada 2 (INST): Taurus executa Blindagem Reativa. Ganha instantaneamente +10 de Armadura e status

#### Sentinela.

#### Camada 3 (CTRL): Glitch executa Blackout em Zero. Zero e atingido por efeito de interrupcao.

#### Camada 4 (ACT):

- Zero tenta executar Lamina de Dados. FALHA: Como Zero sofreu um Controle na camada anterior, a acao

#### e cancelada.

- Jax executa Carga de Detonacao em Vesper. REDIRECIONADO: O ataque e Cinetico, logo, e

#### obrigatoriamente redirecionado para Taurus (Sentinela). Taurus recebe 5 de dano Cinetico (20 base - 15

#### armadura).

#### Camada 5 (AFL): Vesper recebe 15 de dano Corrosivo do Ritual de Sangue de Malakor.

### Log de Combate Final (O que o jogador ve na UI)

#### [INST] Taurus ativou Blindagem Reativa: +10 Armadura, Status Sentinela obtido!

#### [CTRL] Glitch usou Blackout em Zero: Zero foi interrompido!

#### [ACT] Zero tentou usar Lamina de Dados: Acao cancelada por Controle.


#### [ACT] Jax usou Carga de Detonacao: Redirecionado para Taurus (Sentinela). Taurus recebeu 5 de dano

#### Cinetico.

#### [AFL] Vesper recebeu 15 de dano de Aflicao (Malakor).


## 2. Estrutura JSON do Log de Combate (Back-end)

#### Exemplo do evento onde Jax acerta Taurus apos o redirecionamento do Sentinela:

##### {

"event_id": "evt_t4_004",
"event_type": "damage_resolution",
"priority_level": 4,
"source": "Jax",
"target": "Taurus",
"skill_used": "Carga de Detonacao",
"damage_type": "KNT",
"base_value": 20,
"modifiers": {
"Sentinel_Redirect": true,
"Original_Target": "Vesper",
"Armor_Reduction": 15
},
"final_value": 5,
"target_remaining_hp": 95,
"ui_message": "Jax usou Carga de Detonacao: Redirecionado para Taurus (Sentinela).
Taurus recebeu 5 de dano Cinetico."
}

## 3. Estrutura JSON de Personagens (Base de Dados)

#### Exemplo da estrutura Data-Driven para criacao e balanceamento do personagem Taurus:

##### {

"id": "char_extrator_01",
"name": "Taurus, o Rompe-Cascos",
"lineage": "Extratores",
"role": "Tanque / Sentinela",
"energy_affinity": "Red",
"base_hp": 100,
"passive": {
"name": "Nucleo Estavel",
"description": "Possui 5 de Armadura permanente inquebravel.",
"effects": [{"type": "armor", "value": 5, "unpierceable": true}]
},
"skills": [
{
"id": "skill_taurus_01",
"name": "Marreta Hidraulica",
"cost": {"Red": 1, "White": 1},
"nature": "KNT",
"category": "ACT",
"reach": "Melee",
"description": "Causa 25 de dano. +10 dano contra Armadura.",


"effects": [
{"type": "damage", "value": 25},
{"type": "conditional_damage", "condition": "target_has_armor", "value": 10}
]
},
{
"id": "skill_taurus_02",
"name": "Blindagem Reativa",
"cost": {"Red": 1},
"nature": "Status",
"category": "INST",
"reach": "Self",
"description": "Ganha 10 de Armadura e status Sentinela por 2 turnos.",
"effects": [
{"type": "add_status", "status": "Armor", "value": 10, "duration": 2},
{"type": "add_status", "status": "Sentinel", "duration": 2}
]
}
]
}

