import { useEffect } from 'react';
import { store } from '@/lib/store';

export const isV3 = () => store.get('nikki:v3') === '1';

export function useN2() {
  useEffect(() => { document.body.classList.add('n2'); return () => document.body.classList.remove('n2'); }, []);
}
