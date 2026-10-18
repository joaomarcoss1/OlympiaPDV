# Olympia PDV

Ponto de venda **Olympia PDV**: vendas, estoque por tamanho e cor, clientes, entregas e fluxo de caixa.
A interface é clara e limpa, com a marca em dourado, preto e prata.

## Colocar no ar (uma vez)

1. **Banco de dados (Supabase):** abra o projeto em [supabase.com](https://supabase.com/dashboard/project/xnfjaguuovecgbfyxglb),
   vá em **SQL Editor → New query**, cole todo o conteúdo de
   [`supabase/migrations/20261018000000_olympia_pdv.sql`](supabase/migrations/20261018000000_olympia_pdv.sql) e clique em **Run**.
2. **Chave pública:** em **Project Settings → API Keys**, copie a chave *publishable* (`sb_publishable_…`).
   No GitHub, em **Settings → Secrets and variables → Actions → Variables**, crie a variável
   `VITE_SUPABASE_ANON_KEY` com essa chave. (Sem ela o sistema pede a chave na primeira tela.)
3. **Site:** no GitHub, em **Settings → Pages → Source**, escolha **GitHub Actions**. A cada envio para `main`
   o site é publicado em `https://joaomarcoss1.github.io/OlympiaPDV/`.
4. **Primeiro acesso:** abra o site, toque em **Criar conta** com o e-mail da loja. A primeira conta vira a dona
   dos dados. Depois, em **Authentication → Sign In / Providers** no Supabase, desligue *Allow new users to sign up*
   para ninguém mais criar conta. Para liberar outra conta (outro caixa), use **Configurações → Nuvem** no PDV.

## Rodar no computador (desenvolvimento)

```bash
npm install
cp .env.example .env.local   # e cole a chave pública
npm run dev                  # http://localhost:5173
```

## O que tem

| Módulo | Recursos |
| --- | --- |
| **Vender (PDV)** | Busca por nome, marca ou código (leitor de código de barras: Enter adiciona direto) · filtros por categoria/subcategoria · grade cor × tamanho mostrando o estoque · desconto em R$ ou % · cliente opcional (busca ou cadastro na hora) · **entrega** opcional: abre um bloco para destinatário, telefone, endereço com CEP automático, taxa, horário e observações, ou busca o cliente cadastrado e preenche tudo · atalhos F4 (buscar) e F2 (finalizar) |
| **Pagamento** | Dinheiro, PIX, crédito (com parcelas), débito e vale-troca · **combinar formas** (botão *Dividir*) · troco automático · valores rápidos para dinheiro |
| **Pedidos** | Salvos automaticamente · impressão automática do cupom (térmica 58mm/80mm ou A4) · via de entrega com assinatura · reimpressão · cancelamento (somente admin) devolvendo estoque e lançando o estorno no caixa · status da entrega (pendente → saiu → entregue) · exportação para planilha (CSV) |
| **Produtos** | Cadastre **1 modelo** e já monte a grade: tamanhos (atalhos PP–XG, 34–46, Único ou personalizados), cores (paleta pronta ou cor nova) e quantidade de cada combinação · marca · categoria e subcategoria · preço, custo e margem · foto · duplicar produto com a mesma grade |
| **Estoque** | Posição por variação · alerta de estoque baixo · entrada de mercadoria, saída (defeito, perda, uso interno…) e inventário usando a mesma grade · histórico completo de movimentações · valor do estoque a custo e a preço de venda |
| **Categorias e marcas** | Árvore de categorias com subcategorias · cadastro de marcas |
| **Clientes** | Cadastro com endereço (CEP automático), CPF, aniversário e observações · histórico de compras, total gasto e ticket médio · atalho para WhatsApp |
| **Caixa** | Abertura com fundo de troco · entradas (suprimentos) e retiradas (sangrias) · resumo **por forma de pagamento** · dinheiro esperado na gaveta · fechamento com valor contado e diferença · relatório impresso · histórico de caixas |
| **Usuários** | Funções **Administrador** e **Vendedor** · vendedor tem desconto limitado: acima do limite pede a senha de um administrador |
| **Configurações** | Dados e logo da loja no cupom · formato de impressão · formas de pagamento aceitas · parcelas · taxa de entrega padrão · vender sem estoque · **backup e restauração** |

### O que o vendedor pode fazer

Vender, cadastrar clientes, operar o caixa (abrir, registrar entradas e retiradas, fechar) e consultar estoque e produtos.
Cadastrar e editar produtos, mexer no estoque, cancelar vendas, gerenciar usuários e alterar configurações é só do administrador.

## Onde os dados ficam

No **Supabase**, na tabela `pdv_records` (um registro por produto, venda, cliente, movimento de caixa etc.).
Cada aparelho entra uma vez com a conta da loja; depois disso, os vendedores entram só com o usuário do PDV.

- **Vários caixas ao mesmo tempo:** o que um caixa faz aparece nos outros na hora (tempo real).
  O número do pedido é reservado no servidor, e o estoque é **somado** no servidor, então duas vendas
  simultâneas da mesma peça não se sobrescrevem.
- **Sem internet:** o PDV continua vendendo com a cópia salva no aparelho e envia tudo quando a conexão volta
  (o indicador no menu mostra quantas alterações faltam enviar).
- **Segurança:** só contas liberadas (tabela `pdv_members`) leem ou gravam dados (Row Level Security).

## Estrutura

```
supabase/       SQL do banco (tabelas, segurança e funções)
src/
  store/        dados e regras de negócio (vendas, estoque, caixa, permissões), sincronização com o Supabase
  components/   componentes reutilizáveis (grade de variações, formulários, modais do PDV e do caixa)
  pages/        telas (PDV, Vendas, Produtos, Estoque, Categorias, Clientes, Caixa, Usuários, Configurações)
  utils/        formatação, CEP, impressão (cupom, via de entrega, relatório de caixa)
```
