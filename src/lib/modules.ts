// Módulos da NIKKI. Cada casa liga os que lhe fazem falta (decide quem administra a casa).
// Dinheiro e Pessoas estão sempre ligados. Os nomes batem com nikki.household_modules.module.
// «Entre nós» (contas) deixou de ser módulo: é um separador do Dinheiro, sempre que há duas pessoas (a base continua a
// aceitar o nome). Extratos sai da lista até estar feito (a base continua a aceitar o nome). A Agenda não é módulo: está sempre no
// início (a base continua a aceitar o nome).

export type ModuleKey = 'contas' | 'compras' | 'agenda' | 'casa' | 'housekeeping' | 'garagem' | 'objetivos' | 'patrimonio' | 'ginasio' | 'eventos';

export interface ModuleInfo { k: ModuleKey; name: string; ic: string; to: string; what: string }

export const MODULES: ModuleInfo[] = [
  { k: 'compras', name: 'Compras', ic: 'basket', to: '/compras', what: 'A lista por corredores. Em direto quando estão os dois no supermercado: acabaram-se os dois pacotes de leite.' },
  { k: 'casa', name: 'Casa', ic: 'house', to: '/casa', what: 'Contas fixas sem sustos: consumos, faturas lidas da fotografia, IMI, seguros e fidelizações com aviso a tempo.' },
  { k: 'housekeeping', name: 'Housekeeping', ic: 'broom', to: '/housekeeping', what: 'Quem ajuda em casa bem tratado: a lista de cada visita, mensagens com fotografias e o pagamento sempre a tempo.' },
  { k: 'garagem', name: 'Garagem', ic: 'car', to: '/garagem', what: 'Quanto custa mesmo cada quilómetro, o consumo a sério e o IUC, a inspeção e o seguro com um mês de folga.' },
  { k: 'eventos', name: 'Eventos', ic: 'gift', to: '/eventos', what: 'Do batizado às bodas: orçamento, convidados, fornecedores e presentes. E as contas do mês ficam à parte.' },
  { k: 'objetivos', name: 'Objetivos', ic: 'target', to: '/objetivos', what: 'Metas com prazo que se medem sozinhas, com os vossos números. Poucas de cada vez.' },
  { k: 'patrimonio', name: 'Património', ic: 'bars', to: '/patrimonio', what: 'Estamos bem? Saúde financeira de 0 a 100, os fundos e quantos meses os investimentos pagam. Literacia financeira, sem aulas.' },
  { k: 'ginasio', name: 'Ginásio', ic: 'pulse', to: '/ginasio', what: 'As medidas que escolheres, com a evolução num gráfico. Só tu vês. Nem a chinchila.' },
];

/** Com que módulos começa uma casa nova (igual a nikki.default_modules). */
export const DEFAULT_MODULES: ModuleKey[] = ['contas', 'compras', 'agenda', 'casa'];

export const moduleName = (k: string) => MODULES.find((m) => m.k === k)?.name ?? k;

/** O módulo de um caminho da app (null = sempre ligado: Dinheiro, Pessoas, Perfil…). */
export function moduleOf(path: string): ModuleKey | null {
  const m = MODULES.find((x) => path === x.to || path.startsWith(x.to + '/'));
  return m ? m.k : null;
}
