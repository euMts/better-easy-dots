# O que a Better Easy Dots faz

Extensão para Chrome e Firefox que melhora o registro de ponto no **Easydots** (`sys.easydots.com.br` e outros hosts `*.easydots.com.br` / `*.acspontodigital.com.br`).

Tudo roda no navegador. Configurações e cálculos ficam no storage local da extensão. Nenhum dado é enviado a servidores da extensão.

Versão documentada: **1.9.2**.

---

## Em uma frase

Lê a tabela de ponto e o dashboard do Easydots, usa a jornada que você configurou e mostra saldo do dia, cores, sugestões de horário, planejador de banco de horas, simulador de jornada e impacto de solicitações pendentes. A extensão **não** registra o ponto e jamais fará isso.

---

## Onde atua

| Superfície | O que faz |
|------------|-----------|
| Página do Easydots | Injeta UI e cálculos na tabela de registros, nos cards do dashboard e na lista de solicitações |
| Popup do ícone | Status da página, abrir Easydots, configurações, novidades e avaliação na loja |
| Página de configurações | Horários, tolerância, margem, idioma e URL da empresa |
| Página de novidades | Changelog por versão, com abertura automática após instalar ou atualizar |
| Ícone na barra | Badge com a quantidade de registros do dia |

Funciona no **Chrome** e no **Firefox** com o mesmo produto (UI, estilos e funcionalidades).

---

## Configurações

Acessíveis por:

- item **Better Easy Dots** no menu lateral do Easydots (abre em nova aba, com a versão da extensão)
- popup → **Configurações** (engrenagem ou botão no rodapé)
- página de opções do navegador (`settings.html`)
- página de novidades → **Ver configurações**

Campos:

| Campo | Padrão | O que controla |
|-------|--------|----------------|
| Entrada | `08:00` | Início da jornada |
| Saída | `18:10` | Fim da jornada |
| Início do intervalo | `12:00` | Saída para almoço |
| Fim do intervalo | `13:30` | Retorno do almoço |
| Tolerância diária | `10` min (1–60) | Diferenças dentro desse limite no saldo **total do dia** viram `00:00`. Se passar, o saldo bruto inteiro conta como desconto ou hora extra |
| Margem de segurança | `1` min (0–60) | Evita recomendações exatamente no limite. Com 10 min de tolerância e 1 min de margem, a saída segura tenta manter o saldo no máximo em −9 min |
| Idioma | Padrão do navegador | Português (Brasil), English ou idioma da interface do navegador |
| URL do Easydots | Detectada automaticamente | Endereço da empresa; não precisa estar em `/site/login` |

Ações da página:

- **Salvar** — valida horários (saída depois da entrada, intervalo coerente, URL válida) e grava no storage
- **Resetar** — volta aos padrões e marca a jornada como não configurada
- toasts de sucesso/erro nos campos

Enquanto a jornada **não estiver salva**, o card de saldo do dia pede para configurar (link “clicando aqui”).

A URL é lembrada automaticamente quando você abre um host Easydots conhecido.

---

## Na página de registro de ponto

### 1. Saldo do dia

Card no final da tabela `#table_registro_horario`, mesmo **sem nenhum registro** (incluindo o aviso para configurar a jornada).

Mostra:

- **Saldo bruto** — trabalhado menos jornada esperada, segundo a segundo
- **Saldo considerado (após tolerância)** — se o absoluto do bruto cabe na tolerância diária, vira `00:00`; senão, o bruto inteiro permanece
- status colorido:
  - dentro da tolerância (com margem de segurança)
  - no limite da tolerância
  - fora da tolerância (negativo)
  - hora extra válida (positivo além da tolerância)
- **banco estimado após o dia** — banco de horas atual + saldo do dia após tolerância
- extras estimadas hoje, quando o bruto passa da tolerância
- a partir de qual horário a hora extra válida **começa** (com contagem regressiva `HH:MM:SS` pelo relógio local, se o dia ainda estiver aberto)
- quanto de extra válida **já acumulou** pelo horário local
- mensagens de orientação: se sair no horário configurado, o que acontece; mínimo pela tolerância; saída segura; horário para zerar
- tooltip explicando bruto vs considerado, jornada incompleta (`trabalhou X de Y — faltam Z`) ou dia fechado
- crédito “by better easy dots”, que abre a loja da extensão

Com o dia **aberto**, o saldo ao vivo usa o relógio local quando a jornada já passou da projeção configurada. O card atualiza a cada segundo nesses casos.

A tabela ganha scroll interno quando o card de saldo entra, para o restante da página não “pular”.

### 2. Cores nos horários

Cada horário registrado recebe uma cor em relação ao **horário esperado** (não pela tolerância do saldo do dia):

| Cor | Entrada | Saída |
|-----|---------|-------|
| Verde | no horário ou adiantada | no horário ou depois do previsto |
| Amarelo | atraso dentro da tolerância | saída antecipada dentro da tolerância |
| Vermelho | atraso além da tolerância | saída antecipada além da tolerância |

### 3. Coluna “Diferença”

Coluna extra na tabela com `+HH:MM:SS` / `−HH:MM:SS` (ou `00:00:00`).

Tooltips por tipo de registro (entrada, intervalo, retorno, saída), em minutos ou segundos, com o horário previsto. Deixa claro que a tolerância vale no **saldo total do dia**, não em cada registro isolado.

### 4. Sugestões de horário

Enquanto o dia não está completo **e** já existe pelo menos um registro, linhas “Sugestão:” mostram os próximos horários esperados (entrada, saída para intervalo, retorno, saída final).

- horários intermediários seguem a jornada configurada
- a **saída final** pode ser antecipada para a saída segura se o saldo projetado estiver no limite ou negativo fora da tolerância
- se a pessoa ainda não registrou a saída, a sugestão não usa um horário já passado (piso = agora)
- registros extras no mesmo dia são pareados sem encerrar a jornada cedo demais
- tooltip da sugestão: mínimo pela tolerância, seguro recomendado, zerar matematicamente, ou aviso de hora extra

### 5. Importar jornada do Easydots

Ao lado do campo de jornada do próprio site (`#inputHorario`), o botão **Usar na extensão** lê textos no formato:

- `08:00 às 12:00 e 13:30 às 18:10` (com intervalo)
- `08:00 às 18:00` (sem intervalo)

Salva esses horários nas configurações. Estados: salvando, horários salvos, já salvo, jornada inválida. Toast com o detalhe importado.

### 6. Botão Registrar Horário

Se o site mostrar a mensagem de “dispositivo móvel” no lugar do botão `#btnRegister`, a extensão recoloca o botão **Registrar Horário** (roxo, no estilo da extensão).

---

## Cards do dashboard

Os dois cards abaixo viram “flip”: clique (ou Enter/Espaço) mostra o verso; Escape ou o botão fechar volta.

### 7. Banco de horas — planejador de compensação

No card **Saldo no banco de horas**:

**Débito (saldo negativo)**

- verso “Compensação do banco de horas”
- slider **Dias para compensar** (1 até no máximo 90, limitado pela tolerância)
- extra sugerida **por dia** para zerar a dívida
- a extra diária nunca fica **menor ou igual à tolerância** (isso não contaria como hora extra válida)
- mínimo válido = tolerância + margem (ou +1 s se a margem for 0)
- se a dívida for menor que uma extra válida, sugere o mínimo seguro e mostra o saldo positivo que sobraria
- no limite do slider: explica que não dá para parcelar em mais dias

**Crédito (saldo positivo)**

- “Tudo certo”, horas disponíveis, nenhuma compensação necessária

**Zerado**

- “Banco zerado”, saldo equilibrado

### 8. Simulador de jornada

No card do empregador / registro web:

Campos: Entrada, Saída almoço, Retorno, Saída final.

O que calcula:

- saldo bruto da jornada simulada
- impacto **após tolerância** (título principal: dentro da tolerância, no limite, tempo faltante, hora extra)
- se altera o banco: sem impacto, abate dívida, aumenta dívida, zera, ou vira positivo
- a partir de qual horário as extras válidas começam (com countdown e “extras já contando”)
- **saída “segura” antecipada** quando ainda há margem para registrar a saída antes do horário configurado — só no simulador, não no card de saldo da tabela
- essa saída segura muda de cor: pendente, perto (últimos 5 min) ou já passou

Persistência:

- horários digitados são salvos localmente e restaurados **no mesmo dia**
- botão para restaurar os horários automáticos (jornada configurada + registros reais)
- se a jornada da extensão não estiver configurada, pede para configurar

---

## Página de solicitações

Em `/humanresources/solicitacao/index` (Controle de Solicitações), uma barra **Better Easy Dots** acima da grade:

- lista solicitações com situação **pendente**
- abre o detalhe de cada uma e soma o intervalo entre hora início e hora fim
- estados: calculando, nenhuma pendente, estimativa completa, estimativa parcial, sem dados suficientes, erro
- tooltip: é uma **estimativa**; o banco só muda depois da aprovação no Easydots
- a barra aparece mesmo quando o cálculo não puder ser concluído
- no Firefox, se o fetch da página for bloqueado, o background busca o HTML com as credenciais da sessão

---

## Popup do ícone

- título, tagline e versão (clique na versão abre as novidades)
- status da aba atual:
  - **Ativo nesta página do Easydots**
  - aguardando a página carregar ou o login
  - fora do Easydots → botão **Abrir Easydots** (usa a URL salva)
  - no Firefox, se o site ainda não permitiu a extensão → **Permitir nesta página** (pede permissão, injeta os scripts e recarrega)
- convite para avaliar na loja (Chrome Web Store ou AMO, conforme o navegador)
- atalhos: Configurações, Novidades

---

## Página de novidades

- abre sozinha após **instalar** ou **atualizar**, se a versão atual ainda não foi vista
- lista todas as versões, da mais recente para a mais antiga
- badge **Novo** / **New** só na versão mais recente
- data de atualização da última entrada
- botões: avaliar na loja e ver configurações
- marcar como vista ao abrir a página

Também abre pelo popup, pela versão no rodapé das configurações e pelo link “Novidades”.

---

## Badge no ícone

Quando há uma aba do Easydots com a tabela de registros, o ícone mostra a **quantidade de registros do dia** (fundo roxo `#8234e8`). Sem registros, o badge some.

---

## Idioma

Toda a UI da extensão (popup, settings, changelog, textos injetados no Easydots) usa:

- Português (Brasil)
- English
- ou o idioma da interface do navegador

Trocar o idioma nas configurações redesenha o item da sidebar, o saldo do dia e a barra de solicitações.

---

## Comportamento técnico (visível para o usuário)

- observa a página e atualiza as melhorias quando o Easydots redesenha a tabela ou os cards (SPA / PJAX)
- features pesadas (planejador e simulador) entram depois, em idle, para PCs mais lentos não precisarem dar F5 várias vezes
- se a extensão for recarregada/desinstalada no meio da sessão, para de mexer no DOM em vez de quebrar a página
- no Firefox, o popup pode injetar os scripts se a permissão de site for opcional; abas já abertas também recebem a injeção ao instalar/atualizar

---

## O que a extensão **não** faz

- não registra o ponto no seu lugar e não envia registros ao Easydots (jamais fará registro automático)
- não altera o banco de horas real; só estima
- não aprova solicitações
- não envia analytics, telemetria ou conta de usuário
- não acessa sites fora dos hosts configurados no manifest
- não substitui o Easydots: depende da estrutura atual da página (`#table_registro_horario`, `#btnRegister`, navbar, cards do dashboard, `#solicitacao`)

---

## Permissões e privacidade

| Permissão | Motivo |
|-----------|--------|
| `storage` | Horários, URL, idioma, simulador do dia, última versão do changelog vista |
| `tabs` | Achar a aba do Easydots (badge, status do popup, abrir settings/changelog) |
| `windows` | Focar a janela ao reabrir settings/changelog (Chrome; no Firefox a API não pede essa permissão) |
| `*.easydots.com.br` | Injetar melhorias na página que você já abriu |
| `*.acspontodigital.com.br` | Domínio legado |

Nenhum dado sai do seu dispositivo para servidores da extensão. A leitura da tabela e das solicitações acontece só na aba do Easydots que você está usando.

---

## Compatibilidade

- **Navegadores:** Chrome e Firefox, Manifest V3
- **Sites:** `https://*.easydots.com.br/*` (padrão `https://sys.easydots.com.br/`), `https://*.acspontodigital.com.br/*`
- **Gecko ID:** `better-easy-dots@matheuspass.dev`
