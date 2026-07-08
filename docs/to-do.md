# Better Easy Dots — To-do para produção

Checklist para levar a extensão de **quase pronta** a **publicável na Chrome Web Store**.

---

## Já concluído

- Versão beta `0.1.0` no `manifest.json`
- `README.md` + `README.en.md` (com badges de idioma)
- Licença MIT (`LICENSE`)
- Seletores do DOM centralizados em `content.js` → `SELECTORS`
- Espelho local `website/` para dev (HTML corrigido, seletores preservados, favicon, ícones offline, `mirror-dev.js` sem chamadas externas, loading máx. 2s)
- Animações Easydots na extensão (`eed-animations.css`, ripple via `eed-waves.js` no popup/configurações)
- `website/` no `.gitignore`
- Internacionalização (`i18n.js`, `_locales/pt_BR`, `_locales/en`)
- Coluna **Diferença** na tabela de registros (cabeçalho, cálculo por tipo de batida, cores, formato `±HH:MM:SS`)
- Tooltips na coluna **Diferença** e no **Saldo do dia** (com horário previsto e mensagens amigáveis)
- Hover na linha da tabela + destaque visual ao passar o mouse
- Importação de jornada do Easydots (**Usar na extensão**)
- Item **Better Easy Dots** no menu lateral (`#eed-sidebar-settings`) para abrir configurações
- `manifest.prod.json` — manifest de produção sem permissões de localhost

---

## Bloqueadores (fazer antes de publicar)

### 1. ID da Chrome Web Store

- [ ] Criar conta de desenvolvedor na [Chrome Web Store](https://chrome.google.com/webstore/devconsole) (taxa única de US$ 5)
- [ ] Fazer upload do primeiro rascunho da extensão (`.zip` sem pasta `website/`)
- [ ] Copiar o ID real da extensão após a publicação (ou do rascunho na URL `.../detail/.../XXXXXXXX`)
- [ ] Atualizar `config.js`:

  ```js
  const EED_EXTENSION_URL = 'https://chromewebstore.google.com/detail/better-easy-dots/SEU_ID_REAL';
  ```

- [ ] Testar os links:
  - Botão **Avaliar na loja** no popup
  - Link **by better easy dots** no saldo do dia

---

### 2. Build de produção

O `manifest.json` atual mantém localhost para dev. Para publicar, usar `manifest.prod.json`.

- [ ] Gerar o `.zip` com `manifest.prod.json` renomeado/copiado como `manifest.json` (ver item 4)
- [ ] Confirmar que o pacote **não** inclui entradas `127.0.0.1` nem `192.168.x.x`
- [ ] *(Opcional, branch dev)* Manter `manifest.json` com localhost; release usa `manifest.prod.json`

---

### 3. Materiais da Chrome Web Store

**Textos** (rascunhos no `README.md`; copiar/adaptar no painel da loja)

- [ ] **Nome:** Better Easy Dots
- [ ] **Descrição curta** (máx. 132 caracteres)
- [ ] **Descrição longa** (funcionalidades, `*.acspontodigital.com.br`, dados locais, aviso não oficial)
- [ ] **Categoria:** Produtividade (ou Ferramentas)
- [ ] **Idioma principal:** Português (Brasil)

**Imagens**

- [ ] Ícone da loja: 128×128 (`icons/android-chrome-512x512.png` redimensionado)
- [ ] Screenshots (mín. 1, recomendado 3–5): tabela com cores e coluna Diferença, saldo do dia, tooltips, configurações (1280×800 ou 640×400)

**Privacidade**

- [ ] Publicar política de privacidade (GitHub Pages, etc.) — conteúdo mínimo no `README.md` (seção Privacidade) serve de base
- [ ] Informar a URL da política no painel da Chrome Web Store

**Justificativa de permissões (para o revisor)**

- [ ] `storage` — salvar horários e URL do Easydots localmente
- [ ] `host_permissions` em `*.acspontodigital.com.br` e `*.easydots.com.br` — injetar melhorias na página aberta pelo usuário

---

### 4. Empacotamento para upload

- [ ] Gerar `.zip` **somente** com os arquivos da extensão:

  ```
  manifest.json          ← usar manifest.prod.json
  background.js
  config.js
  i18n.js
  settings.js
  settings-ui.js
  settings-ui.css
  settings.html
  settings-page.js
  settings-page.css
  content.js
  content.css
  eed-animations.css
  eed-waves.js
  popup.html
  popup.js
  popup.css
  _locales/
  icons/
  LICENSE
  ```

- [ ] **Não incluir:** `website/`, `docs/`, `manifest.prod.json` (após copiar), `.git/`, `.crx`, `.pem`, `node_modules/`
- [ ] Testar o pacote em `chrome://extensions` antes de enviar à loja

```bash
cp manifest.prod.json manifest.json
zip -r better-easy-dots.zip \
  manifest.json background.js config.js i18n.js settings.js settings-ui.js settings-ui.css \
  settings.html settings-page.js settings-page.css \
  content.js content.css eed-animations.css eed-waves.js \
  popup.html popup.js popup.css _locales/ icons/ LICENSE \
  -x "*.DS_Store"
rm manifest.json && git checkout manifest.json
```

---

## Testes manuais obrigatórios

### 5. Validar em ambiente real

- [ ] Testar em pelo menos **2 subdomínios** diferentes (ex.: `sys.` e o da sua empresa)
- [ ] Primeira visita: URL do Easydots detectada automaticamente (sem forçar `/site/login`)
- [ ] Salvar configurações com campos inválidos → erros no formulário
- [ ] Salvar configurações válidas → saldo, cores e coluna Diferença funcionam
- [ ] Coluna **Diferença**: valores corretos, tooltips e hover na linha
- [ ] Tooltip do **Saldo do dia** explica o resultado
- [ ] Dia incompleto → saldo negativo correto; sugestões de batidas aparecem
- [ ] Dia completo (2 entradas + 2 saídas com intervalo) → saldo com pontualidade
- [ ] Item **Better Easy Dots** no menu lateral e popup → **Configurações** abrem `settings.html`
- [ ] Badge no ícone mostra quantidade de registros com aba do Easydots aberta
- [ ] Recarregar página do Easydots após mudar configs → UI atualiza
- [ ] *(Opcional, dev)* Validar no espelho `http://127.0.0.1:5500/website/` — sem requisições externas no Network

### 6. Testar fluxo pós-publicação

- [ ] Instalar a versão empacotada (não só “recarregar” no modo dev)
- [ ] Links da Chrome Web Store abrem a página correta da extensão
- [ ] Extensão funciona sem nenhuma aba `127.0.0.1` aberta

---

## Riscos conhecidos (mitigar quando possível)

### 7. Acoplamento ao DOM do Easydots

| Seletor | Uso |
|---------|-----|
| `#table_registro_horario` | Tabela de registros (tbody), coluna Diferença, saldo, sugestões, tooltips |
| `#sidebar-menu > ul` / `#eed-sidebar-settings` | Item de configurações no menu lateral |
| `#btnRegister` | Botão de registrar horário |
| `.clock` | Relógio da página |
| `#deviceType` | Container do botão de registro |
| `#inputHorario` | Campo de jornada (importação) |

- [ ] Após qualquer update do Easydots, revalidar o item 5
- [ ] *(Futuro)* Fallback/log em `content.js` quando seletor não existir

### 8. `MutationObserver` no `document.body`

- [ ] Monitorar performance em páginas pesadas; se houver lentidão, restringir o observer à tabela/menu lateral

---

## Melhorias opcionais (pós-v1)

### 9. Popup mais útil

- [ ] Resumo do dia no popup (saldo, última batida, horários configurados ou não)
- [ ] Botão para abrir/focar aba do Easydots

### 10. Testes automatizados

- [ ] Testes unitários para `settings.js` (URL, validação de horários)
- [ ] Testes unitários para saldo e diferença em `content.js`
- [ ] *(Avançado)* E2E com espelho `website/` (só em dev)

### 11. CI / release

- [ ] Script `package.sh` que gera `better-easy-dots.zip` a partir de `manifest.prod.json`
- [ ] Tag de versão alinhada ao `manifest.json`
- [ ] Changelog breve por release

---

## Ordem sugerida de execução

1. Build de produção + empacotamento (itens 2 e 4)
2. Testes manuais (itens 5 e 6)
3. Rascunho na Chrome Web Store + materiais (item 3)
4. Atualizar `EED_EXTENSION_URL` (item 1)
5. Publicar e validar links (itens 1 e 6)
6. Mitigações e melhorias (itens 7–11) conforme prioridade

---

## Critério de “production-ready”

| Cenário | Critério |
|---------|----------|
| **Uso pessoal / sideload** | Itens 2, 4, 5 e 6 concluídos |
| **Chrome Web Store** | Itens 1–6 concluídos + política de privacidade + listing completo |
