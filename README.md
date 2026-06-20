# A Due

Un diario privato per registrare il ciclo, osservazioni quotidiane ed eventi e riconoscere pattern personali nel tempo.

## Funzioni

- Vista **Oggi** con giorno del ciclo, fase stimata e riepilogo recente.
- Vista **Calendario** per inserire dati passati o correnti selezionando una data.
- Vista **Pattern** con grafici per giorno del ciclo, fase e stagione.
- Filtri combinabili per mestruazioni, sesso, litigi, libido, umore, note e altri eventi.
- Previsione del ciclo successivo basata sulla mediana degli intervalli registrati.
- Scale da 1 a 10 per libido, umore, irritabilita e intensita degli eventi.
- Archivio privato su Supabase protetto per account tramite Row Level Security.

## Dati storici

Il file `supabase/history-template.csv` permette di importare osservazioni precedenti. Le date usano il formato `AAAA-MM-GG`; i punteggi accettano valori da 0 a 10, dove una cella vuota indica un dato non osservato.

## Pubblicazione

Il sito viene pubblicato tramite GitHub Pages dal branch `main`.

## Nota

Le correlazioni e le previsioni sono orientative, non diagnosi o indicazioni mediche.
