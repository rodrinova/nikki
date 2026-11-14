// O mapa da NIKKI: onde está cada página e cada função, e por onde se chega lá. Escrito à mão a partir dos ecrãs;
// quando um ecrã ganha ou perde um botão, atualiza-se aqui. `mod` liga a linha a um módulo (só aparece se estiver ligado).

export interface MapFn { n: string; how?: string }
export interface MapPage { n: string; to?: string; via: string; mod?: string; admin?: boolean; fns: MapFn[]; sub?: MapPage[] }
export interface MapZone { k: string; n: string; ic: string; where: string; pages: MapPage[] }

export const MAP: MapZone[] = [
  { k: 'hoje', n: 'Hoje', ic: 'home', where: '1.º botão da barra', pages: [
    { n: 'Hoje', to: '/n2', via: 'Barra → Hoje', fns: [
      { n: 'Ver a hora do próximo compromisso', how: 'no cartão grande' },
      { n: 'Percorrer as horas do dia', how: 'arrastar o dedo no arco' },
      { n: 'Abrir a agenda', how: 'seta no canto do cartão grande' },
      { n: 'Ver o dinheiro do mês face ao normal', how: 'cartão Dinheiro' },
      { n: 'Ver a frente que pede atenção', how: 'cartão laranja' },
      { n: 'A fazer: abrir o detalhe e a ação', how: 'tocar na linha' },
      { n: 'A fazer: marcar como feito', how: 'círculo à esquerda' },
      { n: 'A fazer: dispensar', how: '✕ ou deslizar para o lado' },
      { n: 'A fazer: ver o resto', how: 'botão «Mais»' },
      { n: 'A história da NIKKI', how: 'a cara, no canto de cima à esquerda' },
      { n: 'Nós', how: 'as vossas caras, no canto de cima à direita' },
    ] },
  ] },
  { k: 'agenda', n: 'Agenda', ic: 'cal', where: '2.º botão da barra', pages: [
    { n: 'Agenda', to: '/n2/tempo', via: 'Barra → Agenda', fns: [
      { n: 'Mudar de vista: Dia, Semana, Mês, Ano', how: 'comprimidos no topo' },
      { n: 'Ver os gastos de cada dia', how: 'a lâmina ao lado do dia' },
      { n: 'Abrir a morada no Waze ou Mapas', how: 'tocar no local do evento' },
      { n: 'Criar um evento', how: '+ → Evento' },
      { n: 'De quem é um evento: da casa, meu, só para mim', how: 'ao criar ou ao abrir o evento' },
      { n: 'Repetir um evento (dias da semana, dia do mês)', how: 'ao criar o evento' },
    ] },
    { n: 'Agenda completa', to: '/agenda', via: 'Agenda → ligar calendários', fns: [
      { n: 'Ligar o calendário do iPhone (iCloud)', how: '«iPhone: ligar o iCloud»' },
      { n: 'Ligar o calendário do Android (Google)', how: '«Android: entrar com o Google»' },
      { n: 'Criar a minha ligação de calendário', how: '«Criar a minha ligação»' },
      { n: 'Desligar um calendário', how: '«Desligar»' },
    ] },
  ] },
  { k: 'mais', n: 'Registar (+)', ic: 'plus', where: 'botão laranja ao centro', pages: [
    { n: 'Registar', via: 'Barra → +', fns: [
      { n: 'Escrever ou ditar tudo numa frase', how: 'campo de texto e microfone' },
      { n: 'Despesa (uma ou várias seguidas)', how: 'valor, de quem é, quem pagou, categoria, dia' },
      { n: 'Despesa: juntar a fatura', how: 'fotografia, PDF ou QR da fatura' },
      { n: 'Despesa: ligar a um evento ou compra extraordinária', how: 'campo «Evento»' },
      { n: 'Despesa: ligar a um carro', how: 'campo «Carro»' },
      { n: 'Entrada de dinheiro', how: 'alternar «Despesa / Entrada»' },
      { n: 'Evento na agenda' },
      { n: 'A fazer (para hoje ou outro dia, para quem)' },
      { n: 'Compras: juntar à lista' },
      { n: 'Abastecer o carro', how: 'com os km e o talão' },
      { n: 'Transferência entre vocês' },
      { n: 'Garantia (com o talão)' },
      { n: 'Tarefa para quem ajuda em casa' },
      { n: 'Pagamento do Apple Pay por confirmar', how: 'aparece sozinho ao abrir' },
    ] },
  ] },
  { k: 'casa', n: 'Casa', ic: 'grid', where: '4.º botão da barra', pages: [
    { n: 'Casa', to: '/n2/casa', via: 'Barra → Casa', fns: [
      { n: 'Entrar em cada frente', how: 'tocar no cartão' },
      { n: 'Ver o sinal de cada frente', how: 'o número e o desenho do cartão' },
    ] },
    { n: 'Dinheiro', to: '/n2/dinheiro', via: 'Casa → Dinheiro', fns: [
      { n: 'Mudar de mês', how: 'setas ‹ › no topo, ou tocar numa coluna dos 12 meses' },
      { n: 'Ver o gasto de cada dia', how: 'arrastar à volta do mostrador' },
      { n: 'Dia a dia, à parte e previsão', how: 'os três números por baixo' },
      { n: 'Onde se gastou, face ao normal', how: 'cápsulas «Onde»' },
      { n: 'Doze meses', how: 'matriz de pontos' },
      { n: 'Movimentos do mês', how: 'lista no fim; «Mais» mostra o resto' },
    ], sub: [
      { n: 'Todas as despesas', to: '/dinheiro', via: 'Dinheiro → «Todas as despesas, acertos e categorias»', fns: [
        { n: 'Editar ou apagar uma despesa', how: 'tocar na despesa' },
        { n: 'Procurar nos movimentos', how: 'campo de procura' },
        { n: 'Período e ordem', how: 'filtros no topo da lista' },
        { n: 'Entre nós: quem adiantou e como acertar', how: 'cartão «Entre nós»' },
        { n: 'Registar uma transferência entre vocês', how: 'em «Entre nós»' },
        { n: 'Movimentos a dois' },
        { n: 'Compras extraordinárias', how: 'ao registar a despesa, «Criar e juntar»' },
        { n: 'Ver na garagem', how: 'numa despesa de carro' },
      ] },
      { n: 'Categorias', to: '/dinheiro/categorias', via: 'Todas as despesas → Categorias', fns: [{ n: 'Criar, renomear e arrumar categorias' }] },
    ] },
    { n: 'Compras', to: '/compras', mod: 'compras', via: 'Casa → Compras', fns: [
      { n: 'Juntar à lista', how: 'campo «Adicionar» ou +' },
      { n: 'Riscar o que já está', how: 'tocar no artigo' },
      { n: 'Limpar riscados', how: 'botão no topo' },
      { n: 'Sugestões pelas vossas compras', how: 'comprimido no topo' },
      { n: 'Ver quem está no supermercado', how: 'aparece em direto' },
      { n: 'Ler a fatura do supermercado', how: 'fotografia do talão' },
    ] },
    { n: 'Contas da casa', to: '/casa', mod: 'casa', via: 'Casa → Contas da casa', fns: [
      { n: 'Juntar outra casa', how: '«Juntar outra casa»' },
      { n: 'Confirmar uma conta do mês', how: '«Paguei» / «Tratado»' },
    ], sub: [
      { n: 'Contas fixas', to: '/casa/contas', via: 'Contas da casa → Contas fixas', fns: [{ n: 'Criar e editar contas fixas' }, { n: 'Confirmar o valor do mês' }, { n: 'Ler a fatura da fotografia ou do PDF' }, { n: 'Acompanhar os consumos' }, { n: 'Desligar uma fatura' }] },
      { n: 'Por ano', to: '/casa/ano', via: 'Contas da casa → Por ano', fns: [{ n: 'Ver o custo da casa nos últimos 12 meses' }] },
      { n: 'Supermercado', to: '/casa/supermercado', via: 'Contas da casa → Supermercado', fns: [{ n: 'Quanto se gasta por mês e em quê' }] },
      { n: 'Prazos e contratos', to: '/casa/prazos', via: 'Contas da casa → Prazos', fns: [{ n: 'Criar um prazo (IMI, seguro, fidelização)' }, { n: 'Marcar como pago' }] },
      { n: 'Tarefas', to: '/casa/tarefas', via: 'Contas da casa → Tarefas', fns: [{ n: 'Criar tarefas que se repetem' }, { n: 'Marcar como feito' }, { n: 'Pedir a quem ajuda em casa' }] },
      { n: 'Manutenção', to: '/casa/manutencao', via: 'Contas da casa → Manutenção', fns: [{ n: 'Criar manutenções com data' }, { n: 'Marcar como feito' }] },
      { n: 'Garantias', to: '/casa/garantias', via: 'Contas da casa → Garantias', fns: [{ n: 'Juntar uma garantia', how: 'fotografia, PDF ou digitalizar' }] },
      { n: 'A casa', to: '/casa/casas', via: 'Contas da casa → A casa', fns: [{ n: 'Editar como é a casa' }, { n: 'Arquivar e voltar a pôr uma casa' }] },
    ] },
    { n: 'Ajuda em casa', to: '/housekeeping', mod: 'housekeeping', via: 'Casa → Ajuda em casa', fns: [
      { n: 'Enviar mensagem com fotografia', how: 'campo no fim do ecrã' },
      { n: 'Criar o convite (link e QR) para quem ajuda', how: '«Criar convite»' },
      { n: 'Planear as visitas e mudar a rotina', how: '«Mudar a rotina»' },
      { n: 'Tarefas da rotina e só de um dia' },
      { n: 'Produtos pedidos', how: 'passam para as Compras' },
      { n: 'Visitas feitas' },
      { n: 'Pagamento: quando se paga e marcar «Paguei»' },
    ] },
    { n: 'Garagem', to: '/garagem', mod: 'garagem', via: 'Casa → Garagem', fns: [
      { n: 'Juntar outro carro', how: '«Juntar outro carro»' },
      { n: 'Comparar os carros' },
      { n: 'Abrir um carro', how: 'tocar no carro' },
      { n: 'Num carro: Abastecer, Oficina, Portagens, Outra', how: 'comprimidos a meio do ecrã' },
      { n: 'Num carro: ler os km e o talão da fotografia' },
      { n: 'Num carro: consumo por troço e gasto por mês' },
      { n: 'Num carro: prazos (IUC, seguro, inspeção) e «Paguei»' },
      { n: 'Num carro: registos e «A rever»' },
      { n: 'Num carro: editar', how: '«Editar» no topo' },
    ] },
    { n: 'Eventos', to: '/eventos', mod: 'eventos', via: 'Casa → Eventos', fns: [
      { n: 'Criar um evento com orçamento' },
      { n: 'Abrir um evento', how: 'tocar no evento' },
      { n: 'Num evento: convidados e grupos' },
      { n: 'Num evento: fornecedores, combinado e já pago' },
      { n: 'Num evento: presentes e agradecimentos' },
      { n: 'Num evento: compras e tarefas' },
      { n: 'Num evento: gastos e partes do evento' },
    ] },
    { n: 'Objetivos', to: '/objetivos', mod: 'objetivos', via: 'Casa → Objetivos', fns: [
      { n: 'Criar um objetivo', how: '«Novo» no topo' },
      { n: 'Aceitar uma sugestão da NIKKI', how: '«Juntar»' },
      { n: 'Marcar como cumprido ou arquivar', how: 'ao abrir o objetivo' },
      { n: 'Ver os cumpridos' },
    ] },
    { n: 'Património', to: '/patrimonio', mod: 'patrimonio', via: 'Casa → Património', fns: [
      { n: 'Alternar entre Casal e Eu', how: 'interruptor no topo' },
      { n: 'Ver a saúde financeira de 0 a 100', how: 'o arco' },
      { n: 'Como contámos', how: 'ligação por baixo do arco' },
      { n: 'Evolução do património', how: 'gráfico; dois dedos para aproximar; 3M, 6M, Tudo' },
    ], sub: [
      { n: 'Saúde financeira', via: 'Património → cartão «Saúde financeira»', fns: [{ n: 'Os dois fundos e os três níveis' }, { n: 'Dizer onde está cada fundo' }, { n: 'Próximos passos' }] },
      { n: 'Ativos e investimentos', to: '/patrimonio/ativos', via: 'Património → Ativos e investimentos', fns: [{ n: 'Juntar e editar um ativo' }, { n: 'Atualizar o valor (fica com data)' }, { n: 'Dizer de quem é e se é um fundo' }] },
      { n: 'Rendimentos', to: '/patrimonio/rendimentos', via: 'Património → Rendimentos', fns: [{ n: 'Dizer quanto entra' }, { n: 'Registar uma entrada', how: '«Registar entrada»' }] },
      { n: 'Plano do mês', to: '/patrimonio/plano', via: 'Património → Plano do mês', fns: [{ n: 'Quanto pôr em cada fundo e a investir' }, { n: 'Marcar «Já pus»' }] },
      { n: 'Conquistas e meses livres', to: '/patrimonio/conquistas', via: 'Património → Conquistas e meses livres', fns: [{ n: 'Ver as conquistas' }, { n: 'Meses livres do ano' }] },
    ] },
    { n: 'Ginásio', to: '/ginasio', mod: 'ginasio', via: 'Casa → Ginásio', fns: [
      { n: 'Escolher as medidas a seguir' },
      { n: 'Registar uma avaliação' },
      { n: 'Ver a evolução de uma medida', how: 'tocar na medida' },
      { n: 'Sobrepor medidas' },
      { n: 'De quanto em quanto tempo avaliar' },
    ] },
  ] },
  { k: 'ideias', n: 'Ideias e problemas', ic: 'chat', where: '5.º botão da barra', pages: [
    { n: 'Ideias e problemas', to: '/melhorar', via: 'Barra → Ideias', fns: [
      { n: 'Enviar uma ideia ou um problema', how: 'tipo, onde e o texto' },
      { n: 'Juntar uma captura de ecrã' },
      { n: 'Ver o estado e a resposta' },
    ] },
  ] },
  { k: 'nos', n: 'Nós e conta', ic: 'people', where: 'as vossas caras, no topo do Hoje', pages: [
    { n: 'Nós', to: '/nos', via: 'Hoje → caras no canto', fns: [
      { n: 'Entre nós: a balança', how: 'cartão no topo' },
      { n: 'A semana da casa', how: 'história em ecrã inteiro' },
      { n: 'O vosso ano', how: 'história em ecrã inteiro' },
    ] },
    { n: 'Pessoas', to: '/pessoas', via: 'Nós → Pessoas da casa', fns: [
      { n: 'Convidar a outra pessoa para a casa', how: '«Criar o link e o QR»' },
      { n: 'Partilha das despesas (50/50, 60/40…)', how: '«Partilha das despesas»' },
    ] },
    { n: 'Perfil', to: '/perfil', via: 'Nós → O teu perfil', fns: [
      { n: 'Mudar o nome' },
      { n: 'Notificações e resumo às 8h00' },
      { n: 'Apple Pay → NIKKI', how: 'instruções do atalho' },
      { n: 'Módulos' },
      { n: 'Guia da NIKKI' },
      { n: 'Mapa da NIKKI', how: 'este ecrã' },
      { n: 'Convidar para a NIKKI', how: 'QR para outra casa' },
      { n: 'Entrar noutro aparelho', how: 'código e QR' },
      { n: 'Rapidez deste aparelho' },
      { n: 'A história da NIKKI' },
      { n: 'Sair' },
    ] },
    { n: 'Módulos', to: '/modulos', via: 'Perfil → Módulos', fns: [{ n: 'Ligar e esconder frentes da casa', how: 'interruptor de cada uma' }] },
    { n: 'Administração da app', to: '/admin', admin: true, via: 'Perfil → Administração da app', fns: [
      { n: 'Aprovar, recusar e pausar contas' }, { n: 'Ver as casas e os módulos de cada uma' }, { n: 'Responder a tickets' }, { n: 'Números da app' }, { n: 'Chave do Gemini (leitura de faturas)' }, { n: 'Abrir a casa de demonstração' },
    ] },
    { n: 'Salvados', to: '/salvados', admin: true, via: 'Casa completa → Salvados', fns: [{ n: 'Carros comprados para arranjar e vender: custos, horas, sócio, resultado' }] },
  ] },
];

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
/** Procura no mapa: devolve as páginas (com as funções que batem) para um texto. */
export function searchMap(zones: MapZone[], q: string): { zone: MapZone; page: MapPage; fns: MapFn[] }[] {
  const t = norm(q.trim()); if (!t) return [];
  const out: { zone: MapZone; page: MapPage; fns: MapFn[] }[] = [];
  const walk = (zone: MapZone, p: MapPage) => {
    const fns = p.fns.filter((f) => norm(`${f.n} ${f.how ?? ''}`).includes(t));
    if (fns.length || norm(p.n).includes(t)) out.push({ zone, page: p, fns: fns.length ? fns : p.fns.slice(0, 3) });
    p.sub?.forEach((s) => walk(zone, s));
  };
  zones.forEach((z) => z.pages.forEach((p) => walk(z, p)));
  return out;
}
export const countMap = (zones: MapZone[]) => { let pages = 0, fns = 0; const w = (p: MapPage) => { pages++; fns += p.fns.length; p.sub?.forEach(w); }; zones.forEach((z) => z.pages.forEach(w)); return { pages, fns }; };
