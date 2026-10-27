# Projet Final — Méthodologies de l’IA Générative (2026-2027)
**Université Paris Dauphine - PSL**  
**Master SIREN (Parcours IREN / MTM)**

Bienvenue dans le dépôt de votre groupe.
Membres du groupe : Jimmy Gehres, Moea RICHARD

Ce dépôt sert à centraliser votre livrable final : code, documents, prompts, workflows et éléments de présentation.

---

## Objectif du dépôt

Ce dépôt doit permettre de :
1. **Centraliser** votre travail dans un espace unique.
2. **Assurer la reproductibilité** (exécution du code, relecture des analyses, compréhension de la démarche).
3. **Valider la partie “Partage du Code/Outil”** de l’évaluation finale.

---

## Structure conseillée

Merci de respecter autant que possible la structure suivante :

```text
/ (Racine du dépôt)
│
├── README.md              <-- Présentation rapide du projet
├── Rapport/               <-- Rapport écrit + Journal de bord IA
├── Code/                  <-- Scripts, notebooks, workflows (n8n/Make), etc.
├── Data/                  <-- Jeux de données (si partageables)
└── Presentation/          <-- Supports de soutenance (PDF)
```

---

## Contenu attendu

### 1) README.md (ce fichier)
Présentez en quelques lignes :
- Le sujet et le problème traité
- L’approche choisie
- Les principaux résultats
- Comment lancer/reproduire votre travail

### 2) Rapport/
- Rapport final (PDF)
- Journal de bord IA (prompts, itérations, limites, arbitrages)

### 3) Code/
- Scripts Python/R, notebooks, exports de workflows no-code, etc.
- Un minimum d’instructions pour exécuter les éléments fournis

### 4) Data/
- Données non confidentielles
- Si données trop lourdes : fournir un lien (HuggingFace, Dropbox, etc.) + courte explication

#### Base des visas d’exploitation cinématographique

Le fichier [Liste_visas_exploitation_cinematographique_CNC_1945-2025.xlsx](./Data/Liste_visas_exploitation_cinematographique_CNC_1945-2025.xlsx) recense les visas d’exploitation cinématographique délivrés par le CNC de 1945 à 2025.

- Source : [data.gouv.fr — Liste des visas d'exploitations cinématographiques délivrés de 1945 à 2025](https://www.data.gouv.fr/datasets/liste-des-visas-dexploitations-cinematographiques-delivres-de-1945-a-2025)
- Producteur : Centre national du cinéma et de l’image animée (CNC)
- Licence : [Licence Ouverte 2.0](https://www.etalab.gouv.fr/licence-ouverte-open-licence/)
- Format : Excel (.xlsx)

### 5) Presentation/
- Slides de soutenance (PDF)

---

## Recommandations pratiques

- Faites des commits réguliers avec des messages explicites.
- Ajoutez un `.gitignore` adapté à votre stack.
- Évitez de versionner des fichiers volumineux non nécessaires.
- Vérifiez qu’un tiers peut comprendre et relancer votre projet sans explication orale.

---

## Checklist avant rendu

- [ ] Le dépôt contient toutes les pièces demandées.
- [ ] L’arborescence est claire et cohérente.
- [ ] Les étapes de reproduction sont décrites.
- [ ] Les liens externes (données, modèles, ressources) fonctionnent.
- [ ] Le support de présentation est bien inclus.

Bon travail !
