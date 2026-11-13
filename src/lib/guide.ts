import type { ModuleKey } from './modules';

// O guia da NIKKI: poucas palavras, uma ideia por ecrã. Primeiro a volta à casa (onde está tudo e o dia a dia),
// depois, à medida que cada frente se abre pela primeira vez, três passos de «como se faz».

export type GuideKey = ModuleKey | 'dinheiro';

/** Uma linha por frente, para a volta rápida e para a escolha dos módulos. */
export const FRONTS: { k: GuideKey; ic: string; n: string; one: string; always?: boolean }[] = [
  { k: 'dinheiro', ic: 'coins', n: 'Dinheiro', one: 'Quanto gastaste. Sem fazer contas.', always: true },
  { k: 'compras', ic: 'basket', n: 'Compras', one: 'A lista, em direto para os dois.' },
  { k: 'casa', ic: 'house', n: 'Contas da casa', one: 'Luz, água, renda. Sem sustos.' },
  { k: 'housekeeping', ic: 'broom', n: 'Ajuda em casa', one: 'Tarefas e pagamento de quem ajuda.' },
  { k: 'garagem', ic: 'car', n: 'Garagem', one: 'Quanto custa cada quilómetro.' },
  { k: 'eventos', ic: 'gift', n: 'Eventos', one: 'Do batizado às bodas, à parte.' },
  { k: 'objetivos', ic: 'target', n: 'Objetivos', one: 'Metas que se medem sozinhas.' },
  { k: 'patrimonio', ic: 'bars', n: 'Património', one: 'Estamos bem? De 0 a 100.' },
  { k: 'ginasio', ic: 'pulse', n: 'Ginásio', one: 'As tuas medidas. Só tu vês.' },
];

/** Como se faz, em três passos, dentro de cada frente. */
export const STEPS: Record<string, { t: string; d: string; eg?: string }[]> = {
  dinheiro: [
    { t: 'Regista no +', d: 'Escreve como falas. A NIKKI percebe o valor, o dia e a categoria.', eg: '12 almoço ontem' },
    { t: 'De quem é?', d: 'Tua, dos dois ou da outra pessoa. As contas entre vocês fazem-se sozinhas.' },
    { t: 'O teu normal', d: 'A linha é um mês normal. Quando passas, acende a laranja.' },
  ],
  compras: [
    { t: 'Junta à lista', d: 'Escreve ou dita. Arruma-se sozinha por corredor.', eg: 'leite, ovos e pão' },
    { t: 'No supermercado', d: 'Risca o que já está. A outra pessoa vê no momento.' },
    { t: 'No fim, a fatura', d: 'Fotografa o talão. A despesa fica registada.' },
  ],
  casa: [
    { t: 'Diz como é a casa', d: 'Renda ou prestação, luz, água, internet.' },
    { t: 'Confirma cada mês', d: 'A NIKKI propõe o valor, tu confirmas. Ou fotografas a fatura.' },
    { t: 'Prazos', d: 'IMI, seguros, fidelizações: aviso um mês antes.' },
  ],
  housekeeping: [
    { t: 'Convida quem ajuda', d: 'Um link ou um QR. Fica com a sua própria página.' },
    { t: 'A lista de cada visita', d: 'Tarefas, pedidos e mensagens com fotografia.' },
    { t: 'O pagamento', d: 'A NIKKI lembra o dia. Quem ajuda nunca vê o vosso dinheiro.' },
  ],
  garagem: [
    { t: 'Junta o carro', d: 'Matrícula, seguro, IUC e inspeção.' },
    { t: 'Abastece no +', d: 'Com os quilómetros, sai o consumo e o custo por km.', eg: '45 gasóleo 42 300 km' },
    { t: 'Prazos', d: 'Seguro, IUC e inspeção: aviso um mês antes.' },
  ],
  eventos: [
    { t: 'Cria o evento', d: 'Nome, data e orçamento.' },
    { t: 'Convidados e fornecedores', d: 'Quem vem, e o que falta pagar.' },
    { t: 'Despesas à parte', d: 'Contam no total, mas não estragam o teu mês normal.' },
  ],
  objetivos: [
    { t: 'Escolhe uma meta', d: 'Com número e prazo.', eg: 'restaurantes até 120 € por mês' },
    { t: 'Mede-se sozinha', d: 'Com as vossas despesas e os vossos números.' },
    { t: 'Poucas de cada vez', d: 'Três chegam. A sério.' },
  ],
  patrimonio: [
    { t: 'Junta o que tens', d: 'Contas, poupanças, investimentos. Atualizas o valor quando quiseres.' },
    { t: 'Os dois fundos', d: 'Emergência: 12 meses de despesa. Imprevistos: 2 000 € por adulto.' },
    { t: 'A nota', d: 'De 0 a 100, com o próximo passo dito em português.' },
  ],
  ginasio: [
    { t: 'Escolhe as medidas', d: 'Peso, gordura, o que quiseres seguir.' },
    { t: 'Regista a avaliação', d: 'A NIKKI desenha a evolução.' },
    { t: 'Só tu vês', d: 'Nem a outra pessoa. Nem a chinchila.' },
  ],
};

export const tourKey = (uid: string) => `nikki:tour:${uid}`;
export const guideKey = (uid: string, k: string) => `nikki:guide:${uid}:${k}`;

/** O guia é só para quem adere a partir daqui: quem já cá estava conhece a casa e não é interrompido. */
export const GUIDE_SINCE = '2026-11-13T22:30:00Z';
export const isNewcomer = (createdAt: string | null | undefined) => !!createdAt && createdAt >= GUIDE_SINCE;
