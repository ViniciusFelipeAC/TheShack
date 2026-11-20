import type { AccountStatus, AgentInfo, AgentSettings, AgentSettingsInput } from '@shack/shared';
import { useEffect, useState } from 'react';
import { api, ApiError } from './live.ts';
import { modelChoices } from './models.ts';
import { Picker } from './Picker.tsx';

/**
 * Modelo e esforço do agente, como o /model e o /effort do Claude Code. A troca fica no servidor,
 * vale em todos os aparelhos e não mexe no agent.yaml; "Do agente" volta ao que o arquivo diz.
 */
export function AgentModel({ agent, account }: { agent: AgentInfo; account: AccountStatus | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A escolha aparece na hora; o valor do servidor chega logo depois pelo evento agent.updated.
  const [local, setLocal] = useState<Partial<AgentSettings>>({});
  useEffect(() => { setLocal({}); }, [agent.id, agent.settings.model, agent.settings.effort]);
  const a = { ...agent, settings: { ...agent.settings, ...local } };
  const c = modelChoices(a, account);
  const used = account?.agentModels?.[a.id];

  const save = async (patch: AgentSettingsInput) => {
    setBusy(true);
    setError(null);
    setLocal((l) => ({ ...l, ...patch }));
    try { await api(`/agents/${a.id}/settings`, { method: 'PUT', body: patch }); } catch (err) {
      setLocal({});
      setError(err instanceof ApiError ? err.message : 'Não consegui salvar. O servidor está no ar?');
    }
    setBusy(false);
  };

  return (
    <div className="model-box">
      <h4>Modelo e esforço</h4>
      <Picker label="Modelo" choices={c.models} value={a.settings.model ?? ''} disabled={busy} onPick={(v) => save({ model: v || null })} />
      {c.noEffort ? <p className="meta">Esforço: este modelo não usa.</p> : (
        <Picker
          label="Esforço" choices={c.efforts} value={a.settings.effort ?? ''} disabled={busy}
          onPick={(v) => save({ effort: (v || null) as AgentSettingsInput['effort'] })}
        />
      )}
      <p className="meta">
        {a.chat ? 'Vale a partir da próxima mensagem.' : 'Vale a partir da próxima tarefa; a que está rodando segue como começou.'}
        {' '}Esforço maior pensa mais e gasta mais cota.
        {used ? ` Último modelo usado: ${used}.` : ''}
        {!c.planKnown ? ' A lista completa do seu plano aparece depois da primeira conversa desde que o servidor ligou.' : ''}
      </p>
      {error && <p className="error small" role="alert">{error}</p>}
    </div>
  );
}
