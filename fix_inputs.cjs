const fs = require('fs');
let c = fs.readFileSync('src/views/host/HostTableView.tsx', 'utf8');

c = c.replace(
`                        {settings.tournament?.isHardCapRounds && (
                          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-md px-2 py-1">
                            <label className="text-[10px] font-semibold uppercase tracking-wider text-white/50 whitespace-nowrap">Rounds (20-1000)</label>
                            <Input 
                              type="number" 
                              value={settings.tournament?.maxRounds || ''}
                              onChange={e => setSettings({ ...settings, tournament: { ...settings.tournament!, maxRounds: Math.min(1000, Math.max(20, parseInt(e.target.value) || 20)) } })}
                              min="20" max="1000" placeholder="Rnds"
                              className="h-6 w-12 text-center text-sm bg-transparent border-none focus:outline-none focus:border-none p-0 !ring-0 text-white"
                            />
                          </div>
                        )}`,
`                        {settings.tournament?.isHardCapRounds && (
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-md px-2 py-1">
                              <label className="text-[10px] font-semibold uppercase tracking-wider text-white/50 whitespace-nowrap">Rounds (20-1000)</label>
                              <Input 
                                type="text" 
                                value={settings.tournament?.maxRounds === '' as any ? '' : (settings.tournament?.maxRounds || 0).toLocaleString()}
                                onChange={e => {
                                  const valStr = e.target.value.replace(/,/g, '');
                                  if (valStr === '') {
                                    setSettings({ ...settings, tournament: { ...settings.tournament!, maxRounds: '' as any } });
                                  } else {
                                    const val = parseInt(valStr);
                                    if (!isNaN(val)) {
                                      setSettings({ ...settings, tournament: { ...settings.tournament!, maxRounds: val } });
                                    }
                                  }
                                }}
                                placeholder="Rnds"
                                className={\`h-6 w-12 text-center text-sm bg-transparent border-none focus:outline-none focus:border-none p-0 !ring-0 \${settings.tournament?.maxRounds === '' as any || settings.tournament!.maxRounds < 20 || settings.tournament!.maxRounds > 1000 ? 'text-red-500' : 'text-white'}\`}
                              />
                            </div>
                            {settings.tournament?.maxRounds === '' as any ? (
                              <div className="text-[10px] text-red-500 mt-0.5 leading-tight">Required</div>
                            ) : settings.tournament!.maxRounds < 20 || settings.tournament!.maxRounds > 1000 ? (
                              <div className="text-[10px] text-red-500 mt-0.5 leading-tight whitespace-nowrap">Must be 20 to 1000</div>
                            ) : null}
                          </div>
                        )}`);

c = c.replace(
`                            {settings.tournament?.isScheduledEscalation && (
                              <div className="flex items-center gap-2">
                                <label className="text-[10px] font-semibold uppercase tracking-wider text-white/50 whitespace-nowrap">Every X Rounds (5-30)</label>
                                <Input 
                                  type="number" 
                                  value={settings.tournament?.escalationRounds || ''}
                                  onChange={e => setSettings({ ...settings, tournament: { ...settings.tournament!, escalationRounds: Math.min(30, Math.max(5, parseInt(e.target.value) || 5)) } })}
                                  min="5" max="30"
                                  className="h-8 max-w-[60px] bg-white/5 border-white/10 text-white focus:border-[#126b6f] text-sm px-2 text-center"
                                />
                              </div>
                            )}`,
`                            {settings.tournament?.isScheduledEscalation && (
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                  <label className="text-[10px] font-semibold uppercase tracking-wider text-white/50 whitespace-nowrap">Every X Rounds (5-30)</label>
                                  <Input 
                                    type="text" 
                                    value={settings.tournament?.escalationRounds === '' as any ? '' : (settings.tournament?.escalationRounds || 0).toLocaleString()}
                                    onChange={e => {
                                      const valStr = e.target.value.replace(/,/g, '');
                                      if (valStr === '') {
                                        setSettings({ ...settings, tournament: { ...settings.tournament!, escalationRounds: '' as any } });
                                      } else {
                                        const val = parseInt(valStr);
                                        if (!isNaN(val)) {
                                          setSettings({ ...settings, tournament: { ...settings.tournament!, escalationRounds: val } });
                                        }
                                      }
                                    }}
                                    className={\`h-8 max-w-[60px] bg-white/5 text-white \${settings.tournament?.escalationRounds === '' as any || settings.tournament!.escalationRounds < 5 || settings.tournament!.escalationRounds > 30 ? 'border-red-500 focus:border-red-500' : 'border-white/10 focus:border-[#126b6f]'} text-sm px-2 text-center\`}
                                  />
                                </div>
                                {settings.tournament?.escalationRounds === '' as any ? (
                                  <div className="text-[10px] text-red-500 mt-0.5 leading-tight">Required</div>
                                ) : settings.tournament!.escalationRounds < 5 || settings.tournament!.escalationRounds > 30 ? (
                                  <div className="text-[10px] text-red-500 mt-0.5 leading-tight whitespace-nowrap">Must be 5 to 30</div>
                                ) : null}
                              </div>
                            )}`);
fs.writeFileSync('src/views/host/HostTableView.tsx', c);
