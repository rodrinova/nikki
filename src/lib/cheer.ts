// A mensagem de boas-vindas de quem faz o housekeeping: diferente em cada dia, positiva, que reconhece o trabalho.
// Na 3.ª pessoa («a sua visita», «faça ao seu ritmo») e sem palavras com género (não se sabe quem é): «obrigado» é
// a casa a falar. Não se repete até ter usado todas;
// no mesmo dia é sempre a mesma. Puro.

export const CHEERS: string[] = [
  'A casa fica outra depois da sua visita. E nós também: chegamos e só temos de nos sentar.',
  'Obrigado por cuidar das nossas coisas como cuida. Não é pouco, e nós sabemos.',
  'Hoje não há pressa nenhuma. Faça ao seu ritmo, que o seu ritmo é ótimo.',
  'Aviso importante: as meias sem par não são responsabilidade sua. Do resto, obrigado por tudo!',
  'A sua ajuda dá-nos tempo para estar com quem gostamos. Isso vale muito.',
  'Se faltar alguma coisa, peça aqui sem cerimónias. Nós tratamos.',
  'O aspirador já estava com saudades. Nós também. Bom trabalho!',
  'Há trabalhos que só se notam quando ficam por fazer. O seu nota-se sempre. Obrigado.',
  'Uma pausa para um café também faz parte do dia. Esteja à vontade.',
  'Obrigado pela confiança de entrar na nossa casa. Não a damos por garantida.',
  'Os vidros agradecem, o chão agradece, e nós agradecemos mais do que todos.',
  'Chegar a casa depois da sua visita é das melhores partes da semana. A sério.',
  'Precisa de alguma coisa? Deixe uma mensagem aqui e respondemos logo que pudermos.',
  'Que bom contar outra vez com a sua ajuda. Bom trabalho e boa disposição!',
  'Desculpe a desarrumação. Prometemos melhorar... um bocadinho.',
  'O seu trabalho continua a fazer diferença mesmo nos dias em que não está cá.',
  'Reparamos sempre no cuidado com os pormenores. Obrigado por isso.',
  'Se encontrar alguma coisa avariada, diga-nos. Mais vale saber cedo do que tarde.',
  'Roupa passada a ferro é um pequeno milagre semanal. Obrigado por ele!',
  'Que o dia corra leve. E se alguma coisa correr mal, não faz mal: resolve-se.',
  'Sem a sua ajuda, a nossa semana seria bem mais desarrumada. Obrigado por estar connosco.',
  'Obrigado por fazer desta casa um sítio onde apetece chegar.',
  'O que faz aqui não é só limpar. É cuidar. E isso nota-se.',
  'Já sabe: faça da forma que achar melhor. Confiamos no seu trabalho.',
  'Mais uma visita, mais uma razão para dizer obrigado.',
  'Se hoje o dia estiver pesado, faça só o que der. O resto fica para a próxima visita.',
  'Obrigado pela paciência com as nossas manias. Sabemos que são algumas.',
  'Obrigado por cada coisa que fica feita sem nós sequer darmos conta.',
  'É um gosto ter a sua ajuda cá em casa. Hoje e sempre, obrigado.',
  'Bom dia de trabalho! A loiça diz que já não era sem tempo.',
];

/** Quando a lista do dia fica toda feita (uma por dia, sem repetir a seguir). */
export const DONE: string[] = [
  'Está tudo feito. Obrigado pelo trabalho de hoje, foi uma ajuda enorme.',
  'Lista terminada! Pode respirar fundo: por hoje, missão cumprida.',
  'Tudo feito. A casa agradece, e nós ainda mais.',
  'Não falta nada. Obrigado, e bom resto de dia!',
  'Feito! Hoje vamos chegar a casa e sorrir. Obrigado.',
];

/** Escolha estável por dia (sem memória): para textos que só mudam de dia para dia. */
export const ofDay = (list: string[], day: string) => list[hash(day) % list.length];

const hash = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

export interface CheerMemory { day: string; idx: number; used: number[] }

/**
 * A mensagem de hoje: se já se escolheu hoje, a mesma; senão, uma ainda não usada (escolhida pelo dia, para não
 * seguir sempre a mesma ordem). Quando já se usaram todas, recomeça (sem repetir a de ontem).
 */
export function pickCheer(today: string, mem: CheerMemory | null, n = CHEERS.length): CheerMemory {
  if (mem && mem.day === today && mem.idx < n) return mem;
  let used = (mem?.used ?? []).filter((i) => i < n);
  if (used.length >= n) used = mem ? [mem.idx] : [];
  const free = Array.from({ length: n }, (_, i) => i).filter((i) => !used.includes(i));
  const idx = free[hash(today) % free.length];
  return { day: today, idx, used: [...used, idx] };
}

/** «Bom dia», «Boa tarde» ou «Boa noite», pela hora. */
export const greeting = (hour: number) => (hour >= 6 && hour < 12 ? 'Bom dia' : hour >= 12 && hour < 20 ? 'Boa tarde' : 'Boa noite');
