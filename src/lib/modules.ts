// Módulos da NIKKI. Cada casa liga os que lhe fazem falta (decide quem administra a casa).
// Dinheiro e Pessoas estão sempre ligados. Os nomes batem com nikki.household_modules.module.
// «Entre nós» (contas) deixou de ser módulo: é um separador do Dinheiro, sempre que há duas pessoas (a base continua a
// aceitar o nome). Extratos sai da lista até estar feito (a base continua a aceitar o nome). A Agenda não é módulo: está sempre no
// início (a base continua a aceitar o nome).

export type ModuleKey = 'contas' | 'compras' | 'agenda' | 'casa' | 'housekeeping' | 'garagem' | 'objetivos' | 'patrimonio' | 'ginasio';

export interface ModuleInfo { k: ModuleKey; name: string; ic: string; to: string; what: string }

export const MODULES: ModuleInfo[] = [
  { k: 'compras', name: 'Compras', ic: 'basket', to: '/compras', what: 'Lista partilhada por corredores, em direto quando estão os dois no supermercado.' },
  { k: 'casa', name: 'Casa', ic: 'house', to: '/casa', what: 'Contas fixas com consumos, despesas reconhecidas sozinhas, IMI, seguro e fidelizações com aviso a tempo.' },
  { k: 'housekeeping', name: 'Housekeeping', ic: 'broom', to: '/housekeeping', what: 'Quem ajuda em casa: dias de visita, a lista de cada visita, mensagens nos dois sentidos, produtos a pedir e o pagamento do mês.' },
  { k: 'garagem', name: 'Garagem', ic: 'car', to: '/garagem', what: 'Carros, consumo de cheio a cheio, quanto custa cada quilómetro e os prazos (IUC, inspeção, seguro).' },
  { k: 'objetivos', name: 'Objetivos', ic: 'target', to: '/objetivos', what: 'Limites por categoria, saúde financeira e hábitos da casa, medidos com os vossos números e com prazo.' },
  { k: 'patrimonio', name: 'Património', ic: 'bars', to: '/patrimonio', what: 'Saúde financeira, fundos de emergência e para imprevistos, e quantos meses vivem do que têm.' },
  { k: 'ginasio', name: 'Ginásio', ic: 'pulse', to: '/ginasio', what: 'Avaliações com as medidas que cada um escolher (peso, gordura, massa muscular, idade metabólica…), com a evolução. Só o próprio vê.' },
];

/** Com que módulos começa uma casa nova (igual a nikki.default_modules). */
export const DEFAULT_MODULES: ModuleKey[] = ['contas', 'compras', 'agenda', 'casa'];

export const moduleName = (k: string) => MODULES.find((m) => m.k === k)?.name ?? k;

/** O módulo de um caminho da app (null = sempre ligado: Dinheiro, Pessoas, Perfil…). */
export function moduleOf(path: string): ModuleKey | null {
  const m = MODULES.find((x) => path === x.to || path.startsWith(x.to + '/'));
  return m ? m.k : null;
}
