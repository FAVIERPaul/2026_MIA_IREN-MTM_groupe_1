import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { createNetwork } from '../../network/socket'
import type { ConnectionState } from '../../network/socket'
import type { PublicRoom } from '../../network/types'
import './MultiplayerTestPage.css'

const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'
type Network = ReturnType<typeof createNetwork>
const connectionLabels: Record<ConnectionState, string> = {
  connected: 'Connecté', connecting: 'Connexion en cours…',
  reconnecting: 'Restauration de votre place…', disconnected: 'Connexion perdue',
}

function errorMessage(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null
  if (code === 'INVALID_TOKEN') return 'Votre réservation a expiré ou votre identité n’est plus valide. Rejoignez un salon à nouveau.'
  if (code) return error instanceof Error ? error.message : 'La demande a été refusée.'
  return 'La communication avec le serveur a échoué. Vérifiez qu’il est démarré. Une demande sans réponse peut avoir été appliquée ; attendez la reconnexion avant de réessayer.'
}

export default function MultiplayerTestPage() {
  const network = useRef<Network | null>(null)
  const mounted = useRef(false)
  const busyRef = useRef(false)
  const [connection, setConnection] = useState<ConnectionState>('connecting')
  const [room, setRoom] = useState<PublicRoom | null>(null)
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [createName, setCreateName] = useState('')
  const [joinName, setJoinName] = useState('')
  const [code, setCode] = useState('')

  useEffect(() => {
    mounted.current = true
    const client = createNetwork(serverUrl)
    network.current = client
    const unsubscribe = [
      client.onConnectionState(setConnection),
      client.onRoom(next => {
        setRoom(next)
        setPlayerId(client.getPlayerId())
      }),
      client.onError(cause => setError(errorMessage(cause))),
    ]
    client.connect()
    return () => {
      mounted.current = false
      unsubscribe.forEach(off => off())
      client.dispose()
      network.current = null
    }
  }, [])

  async function perform(action: (client: Network) => Promise<unknown>, message = '') {
    const client = network.current
    if (!client || busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await action(client)
      if (mounted.current && network.current === client) {
        setPlayerId(client.getPlayerId())
        setNotice(message)
      }
    } catch (cause) {
      if (mounted.current && network.current === client) setError(errorMessage(cause))
    } finally {
      busyRef.current = false
      if (mounted.current && network.current === client) setBusy(false)
    }
  }

  function create(event: FormEvent) {
    event.preventDefault()
    void perform(client => client.createRoom(createName), 'Salon créé.')
  }
  function join(event: FormEvent) {
    event.preventDefault()
    void perform(client => client.joinRoom(code.trim().toUpperCase(), joinName), 'Vous avez rejoint le salon.')
  }
  async function copyCode() {
    if (!room) return
    try {
      await navigator.clipboard.writeText(room.code)
      if (mounted.current) setNotice('Code copié.')
    } catch {
      if (mounted.current) setError('Copie impossible. Sélectionnez le code et copiez-le manuellement.')
    }
  }

  const disabled = busy || connection !== 'connected'
  const me = room?.players.find(player => player.id === playerId)
  const isHost = !!playerId && room?.hostId === playerId

  return (
    <main className="multiplayer-console">
      <header>
        <p className="dev-label">DÉVELOPPEMENT · DIAGNOSTIC RÉSEAU</p>
        <h1>BAD DEAL — Multiplayer Test Console</h1>
        <p>Une fenêtre par joueur. Les données viennent du véritable serveur.</p>
      </header>

      <section className="console-panel" aria-label="Connexion au serveur">
        <p role="status"><strong>Connexion :</strong> {connectionLabels[connection]}</p>
        <p>Serveur : <code>{serverUrl}</code></p>
        {connection === 'disconnected' && <p>Reconnexion automatique après une coupure réseau. Votre place est réservée pendant 60 secondes.</p>}
        <div className="console-actions">
          <button disabled={busy || connection !== 'connected'} onClick={() => network.current?.disconnect()}>Simuler une coupure</button>
          <button disabled={busy || connection !== 'disconnected'} onClick={() => network.current?.connect()}>Reconnecter</button>
        </div>
        <small>La coupure simulée reste volontairement active jusqu’au clic sur « Reconnecter ».</small>
      </section>

      {error && <div className="console-error" role="alert">{error}</div>}
      <p className="console-notice" role="status">{busy ? 'Demande en cours…' : notice}</p>

      {!room ? (
        <div className="console-forms">
          <form className="console-panel" onSubmit={create}>
            <h2>Créer un salon</h2>
            <fieldset disabled={disabled}>
              <label htmlFor="create-nickname">Votre pseudo</label>
              <input id="create-nickname" value={createName} onChange={event => setCreateName(event.target.value)} minLength={2} maxLength={20} required autoComplete="off" />
              <button type="submit">CRÉER UN SALON</button>
            </fieldset>
          </form>
          <form className="console-panel" onSubmit={join}>
            <h2>Rejoindre un salon</h2>
            <fieldset disabled={disabled}>
              <label htmlFor="join-nickname">Votre pseudo</label>
              <input id="join-nickname" value={joinName} onChange={event => setJoinName(event.target.value)} minLength={2} maxLength={20} required autoComplete="off" />
              <label htmlFor="room-code">Code du salon</label>
              <input id="room-code" value={code} onChange={event => setCode(event.target.value.toUpperCase())} minLength={6} maxLength={6} pattern="[A-Za-z0-9]{6}" required autoComplete="off" autoCapitalize="characters" spellCheck={false} />
              <button type="submit">REJOINDRE</button>
            </fieldset>
          </form>
        </div>
      ) : (
        <section className="console-panel" aria-label="Salon multijoueur">
          <div className="console-room-heading">
            <h2>Salon <code className="console-code">{room.code}</code></h2>
            <button disabled={busy} onClick={() => { void copyCode() }}>Copier le code</button>
          </div>
          <p>État : <strong>{room.state}</strong> · Révision : {room.revision}</p>
          <p>Vous : <strong>{me?.nickname ?? 'Restauration de l’identité…'}</strong>{me && (isHost ? ' · Hôte' : ' · Joueur')}</p>
          <p>Hôte : {room.players.find(player => player.id === room.hostId)?.nickname ?? 'En attente d’un joueur connecté'}</p>
          <p>{room.connectedCount} connecté(s) · {room.players.length}/8 places occupées · {room.remainingSlots} place(s) disponible(s)</p>
          {connection !== 'connected' && <p>Dernier état connu : la liste sera actualisée à la reconnexion.</p>}
          {room.state === 'playing' && <p className="console-success" role="status">Session de test démarrée. Aucune enchère n’est lancée.</p>}
          <ul className="console-players" aria-label="Liste des joueurs">
            {room.players.map(player => (
              <li key={player.id}>
                <strong>{player.nickname}{player.id === playerId ? ' (vous)' : ''}</strong>
                <span>{player.status === 'connected' ? 'Connecté' : 'Déconnecté · place réservée'}</span>
                <span>{player.isHost ? 'Hôte' : 'Joueur'} · <code>{player.id.slice(0, 8)}</code></span>
              </li>
            ))}
          </ul>
          <div className="console-actions">
            <button disabled={disabled} onClick={() => { void perform(client => client.leaveRoom(), 'Vous avez quitté le salon.') }}>Quitter le salon</button>
            {isHost && <button disabled={disabled || room.state !== 'waiting' || room.connectedCount < 3 || room.connectedCount > 8} onClick={() => { void perform(client => client.startRoom()) }}>Lancer la session de test</button>}
          </div>
          {isHost && room.state === 'waiting' && room.connectedCount < 3 && <p>Il faut au moins 3 joueurs connectés pour démarrer.</p>}
          {!isHost && room.state === 'waiting' && <p>Seul l’hôte peut lancer la session.</p>}
        </section>
      )}
      <footer>Ne rechargez pas la page pour tester une coupure : l’identité est conservée uniquement en mémoire. Un rechargement ne crée aucun joueur automatiquement.</footer>
    </main>
  )
}
