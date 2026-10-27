# Console de test multijoueur (développement)

Depuis `bad-deal/`, installer les dépendances avec `npm install` (Node.js 24 utilisé pour les vérifications).

Dans un premier terminal :

```sh
npm run server:dev
```

Dans un deuxième terminal :

```sh
npm run dev -- --port 5173 --strictPort
```

Ouvrir **http://localhost:5173/dev/multiplayer**. Le statut doit devenir « Connecté ». Le serveur utilisé est affiché. Pour une autre adresse, définir `VITE_SERVER_URL` dans la configuration locale Vite et redémarrer Vite ; configurer aussi les origines autorisées du serveur (voir `server/README.md`).

## Trois joueurs

1. Ouvrir trois fenêtres ou onglets indépendants. Chaque page conserve sa propre identité en mémoire : aucun stockage partagé entre onglets.
2. Première fenêtre : saisir **Jimmy**, puis **CRÉER UN SALON**. Jimmy apparaît comme hôte. Copier le code.
3. Deuxième fenêtre : saisir **Emma** et le code, puis **REJOINDRE**.
4. Troisième fenêtre : faire de même avec **Paul**.
5. Comparer les trois listes : mêmes pseudos, statuts et révision. Le nombre de places occupées inclut les réservations des joueurs déconnectés.
6. Seul Jimmy voit « Lancer la session de test ». Le bouton est désactivé avant trois joueurs connectés. Cliquer : les trois fenêtres doivent afficher `playing` et la confirmation. Aucune enchère n’est implémentée.
7. « Quitter le salon » libère immédiatement la place. Le départ définitif de l’hôte transfère son rôle au plus ancien joueur connecté.

## Coupure et reconnexion

Cliquer sur **Simuler une coupure** dans une fenêtre. Les autres doivent indiquer « Déconnecté · place réservée ». Cette coupure volontaire désactive les tentatives automatiques de Socket.IO : cliquer sur **Reconnecter** avant 60 secondes. Le joueur doit retrouver le même identifiant court, sans doublon.

Pour une coupure réelle (réseau interrompu), Socket.IO retente automatiquement la connexion. La console affiche la perte de connexion puis la restauration de la place. Les commandes restent désactivées pendant cette restauration. Les informations visibles pendant la coupure sont le dernier état reçu, pas une confirmation du serveur.

Attendre plus de 60 secondes avant de reconnecter : la place est libérée et une erreur d’expiration est affichée. Il faut créer ou rejoindre à nouveau un salon ; une session déjà `playing` refuse de nouvelles admissions.

Ne pas actualiser pour tester une coupure. Le jeton privé n’est conservé qu’en mémoire du client réseau existant et n’est jamais affiché. Actualiser perd cette identité, sans créer automatiquement un joueur supplémentaire. L’ancien pseudo reste réservé jusqu’à 60 secondes ; attendre son expiration ou utiliser un autre pseudo pour une nouvelle admission. Un redémarrage serveur efface tous les salons et invalide les identités.

## Erreurs et isolation

Les erreurs serveur s’affichent en français : code inconnu, salon plein, pseudo invalide/déjà utilisé, session commencée ou autorisation refusée. Une erreur de communication invite à vérifier le serveur et son adresse. Une requête sans réponse peut avoir été appliquée : attendre la reconnexion avant de recommencer. Les acknowledgments ont un délai de cinq secondes.

Pour vérifier l’isolation, créer un autre salon dans une quatrième fenêtre. Les arrivées et départs du premier ne doivent pas modifier sa liste. Tester aussi un pseudo existant, un code inexistant et un neuvième joueur. « Copier le code » nécessite l’accès au presse-papiers ; en cas de refus, sélectionner le code manuellement.

## Intégration et validation

`main.tsx` choisit cette page uniquement si `import.meta.env.DEV` est vrai et si le chemin vaut exactement `/dev/multiplayer`. L’import dynamique et le CSS sont éliminés du build de production. En production, ce chemin ne donne jamais accès à la console : selon l’hébergement, il affiche l’application habituelle via le fallback SPA ou une 404. Aucun routeur supplémentaire. `App.tsx` reste intact.

Le composant possède une instance réseau créée dans un effet, détruite avec tous ses abonnements à la sortie. Ceci supporte le double montage de React StrictMode. Aucun polling de salon, aucune création automatique et aucun système de salles parallèle. Les boutons n’accordent aucun droit : le serveur vérifie chaque action.

```sh
npm run server:test
npm run server:build
npm run build
```

`server/tests/network.test.ts` exerce le client réellement utilisé par la page contre des serveurs HTTP éphémères : trois joueurs, synchronisation, démarrage et droits, coupure/reconnexion avec même identité, expiration, révisions anciennes, nettoyage et isolation. Les tests mission 1 restent exécutés.

Les scénarios visuels à vérifier dans un navigateur : formulaires, copie du code, rendu dans trois fenêtres, affichage des boutons selon l’hôte, coupure simulée et mise en page mobile. Les tests réseau automatisés ne remplacent pas ces vérifications visuelles.
