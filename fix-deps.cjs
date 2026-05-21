const fs = require('fs');
let code = fs.readFileSync('src/views/BlackjackTable.tsx', 'utf8');

code = code.replace(
  ']}, [table?.status, dealCountdown, table?.settings.actionTimeLimit, recentWinAmount, table?.seats]);',
  ']}, [table?.status, dealCountdown, table?.settings.actionTimeLimit, !!recentWinAmount, table?.seats?.map(s => s.isReady).join()]);'
);

code = code.replace(
  /const mySeats = table\?\.seats\.map\(.*\) \|\| \[\];/,
  `const mySeats = React.useMemo(() => table?.seats.map((s, i) => s.userId === currentUser?.id ? i : -1).filter(i => i >= 0) || [], [table?.seats?.map(s => s.userId).join(), currentUser?.id]);`
);
fs.writeFileSync('src/views/BlackjackTable.tsx', code);
