import { useEffect } from 'react';


export function useN2() {
  useEffect(() => { document.body.classList.add('n2'); return () => document.body.classList.remove('n2'); }, []);
}
