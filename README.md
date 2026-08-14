# CommunityTree - Plateforme d'enregistrement avec arbre binaire

## Description
Plateforme Web moderne d'enregistrement de membres basée sur un système d'arbre binaire avec placement automatique.

## Technologies
- HTML5
- Tailwind CSS
- JavaScript ES6+
- Firebase Authentication
- Cloud Firestore
- Firebase Cloud Functions
- Firebase Hosting

## Installation

### 1. Créer un projet Firebase
1. Aller sur [Firebase Console](https://console.firebase.google.com/)
2. Cliquer sur "Créer un projet"
3. Suivre les instructions

### 2. Activer Authentication
1. Dans Firebase Console, aller à Authentication
2. Activer la méthode "Email/Mot de passe"
3. Configurer les templates d'email

### 3. Créer Firestore
1. Aller à Firestore Database
2. Créer une base de données en mode production
3. Choisir l'emplacement

### 4. Configurer les règles Firestore
1. Copier le contenu de `firestore.rules`
2. Coller dans l'onglet "Règles" de Firestore
3. Publier les règles

### 5. Configurer le projet
1. Modifier les fichiers HTML avec vos propres valeurs Firebase :
   ```javascript
   const firebaseConfig = {
       apiKey: "VOTRE_API_KEY",
       authDomain: "VOTRE_AUTH_DOMAIN",
       projectId: "VOTRE_PROJECT_ID",
       storageBucket: "VOTRE_STORAGE_BUCKET",
       messagingSenderId: "VOTRE_SENDER_ID",
       appId: "VOTRE_APP_ID"
   };
