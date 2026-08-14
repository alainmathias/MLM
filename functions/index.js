const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

const db = admin.firestore();

// ============================================
// FONCTIONS UTILITAIRES
// ============================================

// Générer un code membre unique
async function generateMemberCode() {
    const counterRef = db.collection('counters').doc('memberCode');
    
    try {
        const result = await db.runTransaction(async (transaction) => {
            const counterDoc = await transaction.get(counterRef);
            
            let currentNumber;
            if (!counterDoc.exists) {
                currentNumber = 1;
                transaction.set(counterRef, { currentNumber });
            } else {
                currentNumber = counterDoc.data().currentNumber + 1;
                transaction.update(counterRef, { currentNumber });
            }
            
            return currentNumber;
        });
        
        return `MB${String(result).padStart(6, '0')}`;
    } catch (error) {
        console.error('Erreur génération code:', error);
        throw new functions.https.HttpsError('internal', 'Erreur génération code membre');
    }
}

// Rechercher la première position disponible (BFS)
async function findNextAvailablePosition(racineId) {
    if (!racineId) {
        return { parentId: null, position: null };
    }
    
    const queue = [racineId];
    const visited = new Set();
    
    while (queue.length > 0) {
        const currentId = queue.shift();
        if (visited.has(currentId)) continue;
        visited.add(currentId);
        
        const currentDoc = await db.collection('users').doc(currentId).get();
        
        if (!currentDoc.exists) continue;
        
        const currentData = currentDoc.data();
        
        // Vérifier gauche
        if (!currentData.leftChildId) {
            return { parentId: currentId, position: 'left' };
        }
        queue.push(currentData.leftChildId);
        
        // Vérifier droite
        if (!currentData.rightChildId) {
            return { parentId: currentId, position: 'right' };
        }
        queue.push(currentData.rightChildId);
    }
    
    // Si l'arbre est plein, ajouter à gauche du premier noeud disponible
    return { parentId: racineId, position: 'left' };
}

// Vérifier si un utilisateur est admin
async function isUserAdmin(uid) {
    try {
        const userDoc = await db.collection('users').doc(uid).get();
        return userDoc.exists && userDoc.data().role === 'admin';
    } catch (error) {
        return false;
    }
}

// ============================================
// FONCTION D'INSCRIPTION PRINCIPALE
// ============================================

exports.inscrireMembre = functions.https.onCall(async (data, context) => {
    try {
        const { 
            email, 
            password, 
            nom, 
            prenom, 
            telephone,
            codeParrain 
        } = data;
        
        // Validation des champs
        if (!email || !password || !nom || !prenom || !telephone) {
            throw new functions.https.HttpsError('invalid-argument', 'Tous les champs sont obligatoires');
        }
        
        // Vérifier si c'est le premier utilisateur (racine)
        const usersSnapshot = await db.collection('users').limit(1).get();
        const isFirstUser = usersSnapshot.empty;
        
        let parrainDoc = null;
        let parrainData = null;
        
        // Si ce n'est pas le premier utilisateur, vérifier le code parrain
        if (!isFirstUser) {
            if (!codeParrain) {
                throw new functions.https.HttpsError('invalid-argument', 'Code parrain obligatoire');
            }
            
            // Rechercher le parrain par code
            const parrainQuery = await db.collection('users')
                .where('codeMembre', '==', codeParrain)
                .limit(1)
                .get();
            
            if (parrainQuery.empty) {
                throw new functions.https.HttpsError('not-found', 'Code parrain inexistant');
            }
            
            parrainDoc = parrainQuery.docs[0];
            parrainData = parrainDoc.data();
        }
        
        // Créer l'utilisateur Firebase Auth
        const userRecord = await admin.auth().createUser({
            email: email,
            password: password,
            displayName: `${prenom} ${nom}`
        });
        
        // Générer le code membre
        const codeMembre = await generateMemberCode();
        
        // Déterminer la position dans l'arbre
        let parentId = null;
        let position = null;
        let parrainId = null;
        
        if (!isFirstUser) {
            // Trouver la racine
            const racineQuery = await db.collection('users')
                .where('position', '==', null)
                .limit(1)
                .get();
            
            let racineId;
            if (racineQuery.empty) {
                // Si pas de racine trouvée, prendre le premier utilisateur
                const firstUser = await db.collection('users')
                    .orderBy('dateInscription')
                    .limit(1)
                    .get();
                racineId = firstUser.docs[0].id;
            } else {
                racineId = racineQuery.docs[0].id;
            }
            
            const positionInfo = await findNextAvailablePosition(racineId);
            parentId = positionInfo.parentId;
            position = positionInfo.position;
            parrainId = parrainDoc.id;
        }
        
        // Créer le document utilisateur
        const userData = {
            uid: userRecord.uid,
            codeMembre: codeMembre,
            nom: nom,
            prenom: prenom,
            telephone: telephone,
            email: email,
            codeParrain: codeParrain || null,
            parrainId: parrainId,
            parentId: parentId,
            position: position,
            leftChildId: null,
            rightChildId: null,
            dateInscription: admin.firestore.FieldValue.serverTimestamp(),
            statut: 'actif',
            role: isFirstUser ? 'admin' : 'member',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        
        // Utiliser une transaction pour tout sauvegarder atomiquement
        await db.runTransaction(async (transaction) => {
            // Sauvegarder l'utilisateur
            transaction.set(db.collection('users').doc(userRecord.uid), userData);
            
            // Mettre à jour le parent
            if (parentId) {
                const parentRef = db.collection('users').doc(parentId);
                const updateData = {};
                if (position === 'left') {
                    updateData.leftChildId = userRecord.uid;
                } else if (position === 'right') {
                    updateData.rightChildId = userRecord.uid;
                }
                transaction.update(parentRef, updateData);
            }
        });
        
        // Retourner les informations de l'utilisateur
        return {
            success: true,
            uid: userRecord.uid,
            codeMembre: codeMembre,
            message: 'Inscription réussie'
        };
        
    } catch (error) {
        console.error('Erreur inscription:', error);
        
        if (error.code === 'auth/email-already-exists') {
            throw new functions.https.HttpsError('already-exists', 'Email déjà utilisé');
        } else if (error.code === 'auth/weak-password') {
            throw new functions.https.HttpsError('invalid-argument', 'Mot de passe trop faible');
        } else if (error.code === 'auth/invalid-email') {
            throw new functions.https.HttpsError('invalid-argument', 'Email invalide');
        }
        
        throw new functions.https.HttpsError('internal', 'Erreur lors de l\'inscription');
    }
});

// ============================================
// FONCTION D'INSCRIPTION ADMIN
// ============================================

exports.inscrireMembreAdmin = functions.https.onCall(async (data, context) => {
    // Vérifier que l'utilisateur est admin
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Non authentifié');
    }
    
    const isAdmin = await isUserAdmin(context.auth.uid);
    if (!isAdmin) {
        throw new functions.https.HttpsError('permission-denied', 'Admin requis');
    }
    
    try {
        const { 
            email, 
            password, 
            nom, 
            prenom, 
            telephone,
            codeParrain 
        } = data;
        
        // Validation des champs
        if (!email || !password || !nom || !prenom || !telephone || !codeParrain) {
            throw new functions.https.HttpsError('invalid-argument', 'Tous les champs sont obligatoires');
        }
        
        // Vérifier le code parrain
        const parrainQuery = await db.collection('users')
            .where('codeMembre', '==', codeParrain)
            .limit(1)
            .get();
        
        if (parrainQuery.empty) {
            throw new functions.https.HttpsError('not-found', 'Code parrain inexistant');
        }
        
        const parrainDoc = parrainQuery.docs[0];
        const parrainData = parrainDoc.data();
        
        // Créer l'utilisateur Firebase Auth
        const userRecord = await admin.auth().createUser({
            email: email,
            password: password,
            displayName: `${prenom} ${nom}`
        });
        
        // Générer le code membre
        const codeMembre = await generateMemberCode();
        
        // Trouver la racine
        const racineQuery = await db.collection('users')
            .where('position', '==', null)
            .limit(1)
            .get();
        
        let racineId;
        if (racineQuery.empty) {
            const firstUser = await db.collection('users')
                .orderBy('dateInscription')
                .limit(1)
                .get();
            racineId = firstUser.docs[0].id;
        } else {
            racineId = racineQuery.docs[0].id;
        }
        
        // Trouver la position
        const positionInfo = await findNextAvailablePosition(racineId);
        const parentId = positionInfo.parentId;
        const position = positionInfo.position;
        
        // Créer le document utilisateur
        const userData = {
            uid: userRecord.uid,
            codeMembre: codeMembre,
            nom: nom,
            prenom: prenom,
            telephone: telephone,
            email: email,
            codeParrain: codeParrain,
            parrainId: parrainDoc.id,
            parentId: parentId,
            position: position,
            leftChildId: null,
            rightChildId: null,
            dateInscription: admin.firestore.FieldValue.serverTimestamp(),
            statut: 'actif',
            role: 'member',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        
        // Utiliser une transaction
        await db.runTransaction(async (transaction) => {
            transaction.set(db.collection('users').doc(userRecord.uid), userData);
            
            if (parentId) {
                const parentRef = db.collection('users').doc(parentId);
                const updateData = {};
                if (position === 'left') {
                    updateData.leftChildId = userRecord.uid;
                } else if (position === 'right') {
                    updateData.rightChildId = userRecord.uid;
                }
                transaction.update(parentRef, updateData);
            }
        });
        
        return {
            success: true,
            uid: userRecord.uid,
            codeMembre: codeMembre,
            message: 'Membre ajouté avec succès'
        };
        
    } catch (error) {
        console.error('Erreur inscription admin:', error);
        
        if (error.code === 'auth/email-already-exists') {
            throw new functions.https.HttpsError('already-exists', 'Email déjà utilisé');
        }
        
        throw new functions.https.HttpsError('internal', 'Erreur lors de l\'ajout du membre');
    }
});

// ============================================
// FONCTION DE SUSPENSION/RÉACTIVATION
// ============================================

exports.suspendreMembre = functions.https.onCall(async (data, context) => {
    // Vérifier que l'utilisateur est admin
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Non authentifié');
    }
    
    const isAdmin = await isUserAdmin(context.auth.uid);
    if (!isAdmin) {
        throw new functions.https.HttpsError('permission-denied', 'Admin requis');
    }
    
    const { userId, action } = data;
    if (!userId) {
        throw new functions.https.HttpsError('invalid-argument', 'ID utilisateur requis');
    }
    
    try {
        const newStatus = action === 'suspendre' ? 'suspendu' : 'actif';
        
        // Mettre à jour Firestore
        await db.collection('users').doc(userId).update({
            statut: newStatus,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // Mettre à jour Firebase Auth
        await admin.auth().updateUser(userId, {
            disabled: action === 'suspendre'
        });
        
        return {
            success: true,
            message: `Membre ${action === 'suspendre' ? 'suspendu' : 'réactivé'} avec succès`
        };
        
    } catch (error) {
        console.error('Erreur suspension:', error);
        throw new functions.https.HttpsError('internal', 'Erreur lors de la mise à jour');
    }
});

// ============================================
// FONCTION DE SUPPRESSION DE MEMBRE
// ============================================

exports.supprimerMembre = functions.https.onCall(async (data, context) => {
    // Vérifier que l'utilisateur est admin
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Non authentifié');
    }
    
    const isAdmin = await isUserAdmin(context.auth.uid);
    if (!isAdmin) {
        throw new functions.https.HttpsError('permission-denied', 'Admin requis');
    }
    
    const { userId } = data;
    if (!userId) {
        throw new functions.https.HttpsError('invalid-argument', 'ID utilisateur requis');
    }
    
    try {
        // Vérifier que l'utilisateur existe
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Utilisateur non trouvé');
        }
        
        const userData = userDoc.data();
        
        // Supprimer les références dans l'arbre
        if (userData.parentId) {
            const parentRef = db.collection('users').doc(userData.parentId);
            const parentDoc = await parentRef.get();
            if (parentDoc.exists) {
                const parentData = parentDoc.data();
                const updateData = {};
                if (parentData.leftChildId === userId) {
                    updateData.leftChildId = null;
                }
                if (parentData.rightChildId === userId) {
                    updateData.rightChildId = null;
                }
                await parentRef.update(updateData);
            }
        }
        
        // Supprimer le document Firestore
        await db.collection('users').doc(userId).delete();
        
        // Supprimer l'utilisateur Firebase Auth
        await admin.auth().deleteUser(userId);
        
        return {
            success: true,
            message: 'Membre supprimé avec succès'
        };
        
    } catch (error) {
        console.error('Erreur suppression:', error);
        throw new functions.https.HttpsError('internal', 'Erreur lors de la suppression');
    }
});

// ============================================
// FONCTION D'OBTENTION DES STATISTIQUES
// ============================================

exports.obtenirStatistiques = functions.https.onCall(async (data, context) => {
    // Vérifier que l'utilisateur est admin
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Non authentifié');
    }
    
    const isAdmin = await isUserAdmin(context.auth.uid);
    if (!isAdmin) {
        throw new functions.https.HttpsError('permission-denied', 'Admin requis');
    }
    
    try {
        const snapshot = await db.collection('users').get();
        let total = 0;
        let actifs = 0;
        let suspendus = 0;
        let aujourdhui = 0;
        let cetteSemaine = 0;
        let ceMois = 0;
        
        const now = new Date();
        const today = new Date(now);
        today.setHours(0, 0, 0, 0);
        
        const weekStart = new Date(today);
        weekStart.setDate(weekStart.getDate() - 7);
        
        const monthStart = new Date(today);
        monthStart.setDate(monthStart.getDate() - 30);
        
        snapshot.forEach(doc => {
            const data = doc.data();
            total++;
            
            if (data.statut === 'actif') actifs++;
            if (data.statut === 'suspendu') suspendus++;
            
            if (data.dateInscription) {
                const date = data.dateInscription.toDate ? data.dateInscription.toDate() : new Date(data.dateInscription);
                if (date >= today) aujourdhui++;
                if (date >= weekStart) cetteSemaine++;
                if (date >= monthStart) ceMois++;
            }
        });
        
        return {
            total,
            actifs,
            suspendus,
            aujourdhui,
            cetteSemaine,
            ceMois,
            tauxActivite: total > 0 ? Math.round((actifs / total) * 100) : 0
        };
        
    } catch (error) {
        console.error('Erreur statistiques:', error);
        throw new functions.https.HttpsError('internal', 'Erreur lors de la récupération des statistiques');
    }
});

// ============================================
// FONCTION DE RECHERCHE DE MEMBRE
// ============================================

exports.rechercherMembre = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Non authentifié');
    }
    
    const { searchTerm } = data;
    if (!searchTerm || searchTerm.length < 2) {
        throw new functions.https.HttpsError('invalid-argument', 'Terme de recherche trop court');
    }
    
    try {
        const searchLower = searchTerm.toLowerCase();
        const results = [];
        
        // Rechercher par code membre
        const codeQuery = await db.collection('users')
            .where('codeMembre', '==', searchTerm)
            .limit(5)
            .get();
        
        codeQuery.forEach(doc => {
            results.push({ id: doc.id, ...doc.data() });
        });
        
        // Si pas de résultat, rechercher par nom, prénom ou email
        if (results.length === 0) {
            const snapshot = await db.collection('users').get();
            snapshot.forEach(doc => {
                const data = doc.data();
                const fullName = `${data.prenom} ${data.nom}`.toLowerCase();
                if (fullName.includes(searchLower) || 
                    data.email.toLowerCase().includes(searchLower) ||
                    (data.telephone && data.telephone.includes(searchTerm))) {
                    results.push({ id: doc.id, ...data });
                }
            });
        }
        
        return {
            success: true,
            results: results.slice(0, 10)
        };
        
    } catch (error) {
        console.error('Erreur recherche:', error);
        throw new functions.https.HttpsError('internal', 'Erreur lors de la recherche');
    }
});

// ============================================
// FONCTION D'OBTENTION DE L'ARBRE COMPLET
// ============================================

exports.obtenirArbreComplet = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Non authentifié');
    }
    
    try {
        const snapshot = await db.collection('users').get();
        const users = {};
        snapshot.forEach(doc => {
            users[doc.id] = doc.data();
        });
        
        // Trouver la racine
        let rootId = null;
        for (const [id, data] of Object.entries(users)) {
            if (!data.position) {
                rootId = id;
                break;
            }
        }
        
        return {
            success: true,
            users: users,
            rootId: rootId
        };
        
    } catch (error) {
        console.error('Erreur obtention arbre:', error);
        throw new functions.https.HttpsError('internal', 'Erreur lors de la récupération de l\'arbre');
    }
});