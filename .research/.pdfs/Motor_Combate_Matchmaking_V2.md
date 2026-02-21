# MOTOR DE COMBATE: BACKEND E MATCHMAKING (V2)

## 1. O Stack (Pilha de Execucao Simultanea)

Como o jogo utiliza resolucao simultanea, o servidor recebe ambos os inputs e os processa baseado em 'Ondas de
Prioridade'. A regra principal para balanceamento de erro de leitura doponente e a 'Regra de Ouro da Energia'.

## A Regra de Ouro do Backend:

A energia e deduzida no exato momento em que a Fase de Planejamento termina. Se uma habilidade for cancelada ou
falhar (devido a um Stun ou morte na execucao), a energia permanece gasta. Isso pune a previsao incorreta e
recompensa a antecipacao.

## As 5 Ondas de Resolucao:

- Onda 0: Estados Globais. Verifica e aplica efeitos passivos e Balizas.
- Onda 1: Instantaneas [INST]. Executa Escudos e Buffs (ex: Blindagem Reativa). Resolve antes de golpes.
- Onda 2: Controle [CTRL]. Executa Stuns e Silences. Se o alvo receber Stun, a acao dele nas proximas ondas recebe
flag 'CANCELLED'.
- Onda 3: Acoes [ACT]. Executa Dano e Cura padrao.
- Onda 4: Aflicoes [AFL]. Processa o dano de DoTs (veneno/virus) no fim da rodada.


# MOTOR DE COMBATE: BACKEND E MATCHMAKING (V2)

## 2. Algoritmo de Matchmaking e Sistema Elo

Para calcular o ganho ou perda de pontos apos cada partida, o motor utiliza o Sistema Elo padrao, bonificando vitorias
contra oponentes mais fortes e minimizando o ganho contra oponentes mais fracos.

## Formula Matematica do Elo:

```
R_novo = R_atual + K * (S - E)
```
- R_novo: Novo rating do jogador.
- R_atual: Rating pre-partida.
- K: Constante de Volatilidade (Ex: K=30. Multiplicador de impacto).
- S: Pontuacao (1 = Vitoria, 0 = Derrota, 0.5 = Empate).
- E: Resultado Esperado (Calculado via probabilidade com base na diferenca de Elo).

## A Janela Expandida (Fila de Pareamento):

O servidor executa o seguinte loop a cada 5 segundos na fila:

- Busca Inicial (T+0s): Diferenca de Elo de ate +/- 50.
- Expansao Media (T+10s): Diferenca de ate +/- 150.
- Busca Limite (T+25s): Diferenca de ate +/- 400.
- Fallback (T+40s): Oferece partida contra IA (Bot) para XP apenas.

## 3. Logica de Recomposicao e Desistencia (AFK)

A infraestrutura preve quedas de conexao acidentais, criando uma janela de tolerancia antes de aplicar penalidades por
abandono.

## A Regra do 'Bot Provisorio' (Janela de 90s):

O usuario desconectado tem 2 rodadas completas ou 90 segundos para reconectar. Durante esse tempo, a partida
NAO pausa. O motor assume o controle da equipa doponente caido como um 'Bot Provisorio' que apenas pula o turno
(nao gasta energia). Isso impede que o jogador online fique travado.

## Penalidades de Desistencia (Ao estourar o limite de tempo/rodadas):

1. Desistente (Leaver): Recebe perda dobrada de Elo (-2x pontos negativos calculados) e 0 XP.
2. Oponente (Winner): Recebe o ganho normal de Elo (+1x) e todo o XP de linhagem.

## Exemplo de Fluxo de Recomposicao:

- Turno 5: Jogador A cai da partida. O Jogador B e avisado (aguardando 90s).
- Turno 5 (Execucao): A equipa de A fica imovel e absorve ataques.
- Turno 6 (Planejamento): Jogador A reconecta, assumindo o HP atual da sua equipa e jogando normalmente.
- (Se o Jogador A nao tivesse voltado ate o Turno 7, o servidor encerraria com Vitoria por Desistencia).
