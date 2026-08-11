# RELEASE_CHECKLIST — Better Easy Dots

Checklist de publicação na Chrome Web Store. Use antes de cada reenvio.

## 0. Causa conhecida da rejeição Yellow Magnesium (v1.7.0)

O ZIP de `1.7.0` gerado pelo `package.sh` antigo **omitia** `pending-requests-impact.js`, arquivo listado em `content_scripts` e responsável por chamar `init()`.

Resultado: a extensão instalava, mas **não ativava** as melhorias no Easydots → rejeição “Functionality not working / Não oferecer a funcionalidade prometida”.

Sempre rode `npm run package` (valida + empacota). Não envie ZIP feito à mão.

---

## 1. Gerar pacote de produção

```bash
npm run package
```

Confirme no terminal:

- validação passou (`Pacote válido.`)
- caminho do ZIP (`builds/better-easy-dots-vX.Y.Z.zip`)
- `pending-requests-impact.js` na lista de arquivos
- `manifest.json` na raiz (não dentro de `dist/` nem `better-easy-dots/`)

## 2. Extrair o ZIP em pasta limpa

```bash
rm -rf /tmp/eed-store-test
mkdir -p /tmp/eed-store-test
unzip -q "builds/better-easy-dots-v$(node -p "require('./manifest.prod.json').version").zip" -d /tmp/eed-store-test
ls /tmp/eed-store-test/manifest.json
```

O arquivo `manifest.json` deve existir **diretamente** em `/tmp/eed-store-test/manifest.json`.

## 3–6. Carregar no Chrome

1. Abra `chrome://extensions`
2. Ative **Modo do desenvolvedor**
3. Clique em **Carregar sem compactação**
4. Selecione a pasta extraída (`/tmp/eed-store-test`)
5. Confirme que o card da extensão **não** mostra erro (ícone vermelho / “Service worker registration failed” / content script missing)

## 7–9. Testar no Easydots

Abra `https://sys.easydots.com.br/` (logado) e verifique:

- [ ] Registros do Dia melhorados (cores / sugestões)
- [ ] Saldo do dia
- [ ] Banco de horas (card)
- [ ] Simulador de jornada
- [ ] Banco com pendentes / impacto na página de solicitações (se aplicável)
- [ ] Página de solicitações com resumo de impacto (se houver pendentes)
- [ ] Engrenagem Better Easy Dots na sidebar
- [ ] Popup com status **Ativo nesta página do Easydots.**

## 10. Página fora do Easydots

1. Abra `https://www.google.com` (ou qualquer site)
2. Clique no ícone da extensão
3. Deve aparecer: **Abra o Easydots para usar o Better Easy Dots.**
4. A página visitada não deve quebrar / console sem erros da extensão

## 11. Domínio certo, sem login / página incompleta

1. Abra o domínio Easydots em tela de login ou página sem tabela de registros
2. Popup deve mostrar: **Aguardando página do Easydots carregar ou login do usuário.**
3. Não deve parecer “extensão vazia/quebrada”

## 12. Console

No Easydots logado, DevTools → Console:

- [ ] Sem erros críticos da extensão
- [ ] Idealmente: `[Better Easy Dots] pending-requests-impact ativo`

## 13. Descrição da Chrome Web Store

Cole na listagem **apenas** o que a versão enviada entrega. Texto sugerido (PT):

> Melhora o registro de ponto no Easydots (sys.easydots.com.br): saldo do dia, cores por tolerância, sugestões de batida, banco de horas, simulador de jornada e impacto estimado de solicitações pendentes. Configurações locais no navegador — sem enviar seus dados a servidores da extensão.
>
> Como usar: instale, abra o Easydots da sua empresa, configure os horários na engrenagem Better Easy Dots e veja as melhorias na tabela de registros.

English (short):

> Improves the Easydots time clock: daily balance, tolerance colors, punch suggestions, hour bank, schedule simulator, and estimated impact of pending requests. Settings stay in your browser.
>
> Open your company Easydots page after installing to use the features.

**Não prometer:**

- funcionalidades futuras
- páginas ainda não suportadas
- integrações que não aparecem no ZIP
- qualquer coisa que só exista no `manifest.json` de desenvolvimento (localhost)

## 14. Só então enviar o ZIP

Envie o arquivo gerado por `npm run package`:

`builds/better-easy-dots-vX.Y.Z.zip`

Não recompacte a pasta do repositório inteira (isso inclui `website/`, `docs/`, etc. e pode aninhar pastas).

---

## Comandos úteis

```bash
npm run validate          # valida raiz do repo (dev)
npm run validate:dist     # valida dist/ após package
npm run validate:json     # JSON dos locales + manifests
npm run package           # dist/ + validação + ZIP
```

Após publicar na loja com sucesso, atualize `EED_CHANGELOG_LAST_SHIPPED_VERSION` em `changelog.js`.
