# BAD DEAL — Infrastructure multijoueur

Depuis `bad-deal/`, avec Node.js 22.12+ (ou 24) et npm :

```sh
npm install
npm run server:dev
npm run server:test
npm run server:build
npm run build
```

Le serveur écoute sur `127.0.0.1:3001`. `PORT` et `HOST` configurent l’écoute ; utiliser `HOST=0.0.0.0` pour un accès réseau. Le frontend conserve ses scripts existants, dont `npm run dev`. Aucun composant React n’est modifié.

## Configuration

Le client utilise `VITE_SERVER_URL`, sinon `http://localhost:3001`. En développement, les origines navigateur acceptées sont `http://localhost:5173` et `http://127.0.0.1:5173`.

En production, définir `NODE_ENV=production` et `ALLOWED_ORIGINS=https://jeu.example,https://autre.example`. Une liste absente ou contenant `*` empêche le démarrage. Le contrôle d’origine s’applique également aux WebSockets. Les clients sans en-tête Origin (tests, clients natifs) restent autorisés : une origine n’est pas une identité. Terminer HTTPS/WSS au reverse proxy, transmettre les upgrades WebSocket et adapter ses délais aux connexions persistantes.

## Organisation

- `rooms/RoomManager.ts` : état métier en mémoire, admissions, départs et transitions.
- `players/PlayerManager.ts` : identité serveur, association socket et vérificateurs de jetons.
- `sockets/registerHandlers.ts` : validation des commandes et notifications.
- `security/validation.ts` : validation runtime stricte et erreurs stables.
- `app.ts` : serveur HTTP injectable, configuration et nettoyage.
- `src/network/types.ts` et `events.ts` : contrats provisoires communs, sans dépendance serveur ni modification de `src/shared/`.
- `src/network/socket.ts` : fabrique réutilisable sans singleton ni interface React.

`server:build` effectue une vérification TypeScript sans émission. `server:dev` lance TypeScript avec tsx. `createApp().close()` ferme les sockets et le minuteur, notamment dans les tests.

## Cycle d’un salon

Un créateur reçoit une identité UUID et devient hôte d’un salon `waiting`. Le code public contient six caractères majuscules alphanumériques, tirés avec `crypto.randomInt`, avec vérification d’unicité. UUID du salon, UUID du joueur et identifiant de socket sont distincts. Huit places maximum, y compris celles réservées. Les pseudos sont normalisés, nettoyés et comparés sans casse dans chaque salon.

Seul l’hôte peut démarrer avec au moins trois joueurs connectés. La transition vers `playing` est une session de test : aucune enchère ni économie n’est exécutée. Les nouvelles admissions sont alors refusées. `RoomManager.finish()` prépare une transition interne vers `finished` ; aucune commande navigateur ne l’expose.

Une coupure réserve la place pendant 60 secondes. Le joueur devient `disconnected`, son pseudo reste réservé et l’hôte conserve son rôle pendant ce délai. À expiration ou départ volontaire, l’hôte est remplacé par le joueur connecté ayant le plus petit ordre d’arrivée. Sans joueur connecté, l’hôte peut être nul ; le premier joueur qui revient obtient alors ce rôle. Lorsque tout le monde se déconnecte, les réservations sont conservées jusqu’à expiration, puis le salon vide est supprimé. Le nettoyage intervient au plus une seconde après l’échéance ; une reconnexion après l’échéance est immédiatement refusée.

Le jeton privé contient 32 octets aléatoires. Seul son SHA-256 est conservé côté serveur et la comparaison utilise `timingSafeEqual`. Chaque reconnexion réussie remplace le jeton ; un jeton précédent ne fonctionne plus. Une connexion déjà active ne peut être remplacée par reconnexion. Quitter volontairement détruit l’identité.

## Protocole

Chaque commande exige un acknowledgment. Les payloads n’acceptent que les champs documentés ; les champs d’identité arbitraires sont refusés.

| Commande | Payload | Données de succès |
| --- | --- | --- |
| `room:create` | `{ nickname }` | `{ room, playerId, reconnectToken }` |
| `room:join` | `{ code, nickname }` | `{ room, playerId, reconnectToken }` |
| `room:reconnect` | `{ playerId, reconnectToken }` | `{ room, playerId, reconnectToken }` |
| `room:leave` | `{}` | `null` |
| `room:start` | `{}` | état public du salon |

Succès : `{ success: true, data: ... }`. Échec : `{ success: false, code: 'ROOM_FULL', message: 'Salon complet.' }`.

Codes stables : `INVALID_PAYLOAD`, `ROOM_NOT_FOUND`, `ROOM_FULL`, `ROOM_NOT_WAITING`, `NICKNAME_TAKEN`, `ALREADY_IN_ROOM`, `NOT_IN_ROOM`, `NOT_HOST`, `NOT_ENOUGH_PLAYERS`, `INVALID_TOKEN`, `LIMIT_REACHED`, `RATE_LIMITED`, `INTERNAL_ERROR`.

Notifications :

| Événement | Payload |
| --- | --- |
| `room:updated` | état public du salon |
| `room:started` | état public du salon |
| `player:disconnected` | `{ room, playerId }` |
| `player:reconnected` | `{ room, playerId }` |

Un état public contient `id`, `code`, `state`, `players`, `hostId`, `remainingSlots`, `connectedCount`, `revision`. Chaque joueur public contient `id`, `nickname`, `roomId`, `status`, `isHost`, `connectedAt` (timestamp Unix en millisecondes) et `arrivalOrder`. Aucun socket, jeton ou vérificateur n’est diffusé. `connectedAt` est la date d’arrivée initiale. `revision` augmente à chaque mutation ; comparer les révisions uniquement à l’intérieur d’un même identifiant de salon.

## Exemple avec plusieurs joueurs

Lancer le serveur puis, dans un terminal depuis `bad-deal/`, exécuter `node --input-type=module` et coller :

```js
import { io } from 'socket.io-client';
const connect = async () => {
  const s = io('http://localhost:3001');
  await new Promise(resolve => s.once('connect', resolve));
  s.on('room:updated', room => console.log(s.id, room));
  return s;
};
const [alice, bob, charlie] = await Promise.all([connect(), connect(), connect()]);
const result = await alice.emitWithAck('room:create', { nickname: 'Alice' });
console.log(result); // { success: true, data: { room, playerId, reconnectToken } }
const code = result.data.room.code;
await bob.emitWithAck('room:join', { code, nickname: 'Bob' });
await charlie.emitWithAck('room:join', { code, nickname: 'Charlie' });
console.log(await alice.emitWithAck('room:start', {}));
const disconnected = new Promise(resolve => bob.once('player:disconnected', resolve));
alice.disconnect();
await disconnected;
const replacement = await connect();
console.log(await replacement.emitWithAck('room:reconnect', {
  playerId: result.data.playerId,
  reconnectToken: result.data.reconnectToken,
})); // conserver le NOUVEAU jeton privé de cette réponse
[bob, charlie, replacement].forEach(s => s.disconnect());
```

Pour React, créer une instance `createNetwork()`, enregistrer `onConnectionState`, `onRoom` et `onError`, puis appeler `connect()`. Une fois connecté, utiliser `createRoom`, `joinRoom`, `leaveRoom` et `startRoom`. La reconnexion réseau est automatique tant que l’instance conserve ses identifiants en mémoire. `reconnect()` permet de réessayer explicitement. Les requêtes hors connexion sont refusées, avec un délai de réponse de cinq secondes. Les mises à jour plus anciennes sont ignorées. Appeler les fonctions de désabonnement et `dispose()` lors du démontage du propriétaire de l’instance. `disconnect()` simule une coupure et conserve les identifiants, contrairement à `leaveRoom()`.

## Tests et limites

Vitest démarre des serveurs HTTP sur ports éphémères, connecte de vrais clients Socket.IO et ferme toutes les ressources. Les tests couvrent admissions, synchronisation, limites, droits, reconnexion, rotation de jeton, expiration, transfert d’hôte, isolation, entrées malformées et origines interdites. Le délai de réservation est injectable dans les tests.

Tout est en mémoire : redémarrer le processus supprime les salons, identités et réservations. Aucun compte permanent. Le navigateur conserve les jetons uniquement dans la mémoire de l’instance : recharger la page perd la reconnexion. Une requête dont la réponse est perdue peut avoir été appliquée ; pas de réessai aveugle d’une création. Le module ne persiste pas les jetons et ne les journalise pas.

Limites par défaut : 1 000 salons, 8 000 joueurs réservés ou connectés, 10 000 connexions et 30 commandes par connexion par fenêtre de dix secondes. Les messages dépassant 4 Kio sont coupés par Socket.IO. Une nouvelle connexion réinitialise son compteur ; pour une exposition publique, compléter au proxy par des limites IP adaptées. Une identité active par connexion ; sans comptes, un utilisateur peut ouvrir plusieurs onglets comme plusieurs joueurs. Pas de fonctionnement multi-processus sans stockage et coordination partagés.

À valider avec l’équipe : déplacement ultérieur des contrats vers `src/shared/`, intégration des composants de lobby, politique après abandon d’une session `playing`, persistance des identités entre rechargements, règles exactes des enchères. `GameActionValidator` et `AuthorizedActionContext` proposent une interface pour la future validation métier ; aucun événement d’enchère n’est accepté actuellement. Le futur module devra contrôler l’appartenance et l’état, produire son contexte depuis le serveur et publier une nouvelle révision après mutation.
