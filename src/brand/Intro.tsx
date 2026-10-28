import { useEffect, useState } from 'react';

// Abertura: NIKKI escrito com os dois K normais e à altura das outras letras. O primeiro K vira-se e os
// dois encolhem para 80%, o N e os I esbatem e saem, os olhos piscam, os bigodes mexem e a cara vai para
// o centro e sobe. Assim percebe-se que o logótipo é o nome. Aparece na primeira abertura de cada dia.
export const INTRO_KEY = 'nikki_intro_day';

const N = 'M0 60V20H3.43L22.4 53.87V20H25.6V60H22.17L3.2 26.13V60Z';
const I1 = 'M38.4 20H41.6V60H38.4Z';
const I2 = 'M101.9 20H105.1V60H101.9Z';

export function Intro({ onDone }: { onDone: () => void }) {
  const [out, setOut] = useState(false);
  useEffect(() => {
    const a = setTimeout(() => setOut(true), 2800);
    const b = setTimeout(onDone, 3250);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [onDone]);
  const skip = () => { setOut(true); setTimeout(onDone, 320); };
  return (
    <div className={`intro${out ? ' out' : ''}`} onClick={skip} aria-hidden="true">
      <svg viewBox="0 20 105.1 40" fill="currentColor">
        <g className="all">
          <path className="lt" d={N} /><path className="lt" d={I1} /><path className="lt" d={I2} />
          <g className="facegrp">
            <g className="k1">
              <path className="wk-l" d="M62.15 38.89L52.62 24H51.2L62.15 41.11Z M62.15 38.89L51.2 56H52.62L62.15 41.11Z" />
              <path className="eyes" d="M62.15 24H65.35V56H62.15Z" />
            </g>
            <g className="k2">
              <path className="eyes" d="M78.15 24H81.35V56H78.15Z" />
              <path className="wk-r" d="M81.35 38.89L90.88 24H92.3L81.35 41.11Z M81.35 38.89L92.3 56H90.88L81.35 41.11Z" />
            </g>
          </g>
        </g>
      </svg>
    </div>
  );
}
