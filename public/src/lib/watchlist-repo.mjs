/* Firestore persistence for the watchlist (users/{uid}/watchlist/{ticker}) and
   its folders (users/{uid}/watchlistFolders/{id}), keeping the localStorage
   mirrors in storage.mjs in sync. No DOM access: functions that can fail
   return null/false (after logging) and the caller decides what to tell the
   user. */
import {
    db, auth, collection, setDoc, getDocs, doc, deleteDoc, updateDoc, writeBatch, arrayRemove
} from './firebase.mjs';
import { getCachedFolders, setCachedFolders, getCachedWatchList, setCachedWatchList } from './storage.mjs';

export async function fetchWatchlistItems(uid) {
    const watchlistCollectionRef = collection(db, `users/${uid}/watchlist`);
    try {
        const querySnapshot = await getDocs(watchlistCollectionRef);
        let watchlistItems = [];
        querySnapshot.forEach((doc) => {
            let data = doc.data();
            watchlistItems.push({
                ticker: doc.id,
                goodBuyPrice: data.goodBuyPrice,
                badBuyPrice: data.badBuyPrice,
                name: data.name || null,
                currentPrice: data.currentPrice ?? null,
                dividendYield: data.dividendYield || null,
                bandsUpdatedAt: data.bandsUpdatedAt ?? null,
                folderIds: Array.isArray(data.folderIds) ? data.folderIds : []
            });
        });
        return watchlistItems;
    } catch (e) {
        console.error("Error fetching watchlist items: ", e);
        return [];
    }
}

export async function fetchWatchlistFolders(uid) {
    const foldersCollectionRef = collection(db, `users/${uid}/watchlistFolders`);
    try {
        const querySnapshot = await getDocs(foldersCollectionRef);
        let folders = [];
        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            folders.push({ id: docSnap.id, name: data.name || 'Untitled', createdAt: data.createdAt ?? 0 });
        });
        folders.sort((a, b) => a.createdAt - b.createdAt);
        return folders;
    } catch (e) {
        console.error("Error fetching watchlist folders: ", e);
        return [];
    }
}

// Pulls the user's watchlist and folders from Firestore into the caches the
// other pages read (called right after sign-in).
export async function syncWatchlistCache(uid) {
    setCachedWatchList(await fetchWatchlistItems(uid));
    setCachedFolders(await fetchWatchlistFolders(uid));
}

export async function createFolder(uid, name) {
    const foldersCollectionRef = collection(db, `users/${uid}/watchlistFolders`);
    const newDocRef = doc(foldersCollectionRef);
    const folder = { id: newDocRef.id, name: name, createdAt: Date.now() };
    try {
        await setDoc(newDocRef, { name: folder.name, createdAt: folder.createdAt });
    } catch (e) {
        console.error("Error creating folder: ", e);
        return null;
    }
    const folders = getCachedFolders();
    folders.push(folder);
    setCachedFolders(folders);
    return folder;
}

export async function renameFolder(uid, folderId, name) {
    try {
        await updateDoc(doc(db, `users/${uid}/watchlistFolders`, folderId), { name: name });
    } catch (e) {
        console.error("Error renaming folder: ", e);
        return false;
    }
    setCachedFolders(getCachedFolders().map(folder => folder.id === folderId ? { ...folder, name: name } : folder));
    return true;
}

// Deletes the folder and strips its id from every item that referenced it.
export async function deleteFolder(uid, folderId) {
    try {
        await deleteDoc(doc(db, `users/${uid}/watchlistFolders`, folderId));

        const watchlistCollectionRef = collection(db, `users/${uid}/watchlist`);
        const querySnapshot = await getDocs(watchlistCollectionRef);
        const removals = [];
        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (Array.isArray(data.folderIds) && data.folderIds.includes(folderId)) {
                removals.push(updateDoc(docSnap.ref, { folderIds: arrayRemove(folderId) }));
            }
        });
        await Promise.all(removals);
    } catch (e) {
        console.error("Error deleting folder: ", e);
        return false;
    }

    setCachedFolders(getCachedFolders().filter(folder => folder.id !== folderId));

    setCachedWatchList(getCachedWatchList().map((item) => {
        if (Array.isArray(item.folderIds) && item.folderIds.includes(folderId)) {
            return { ...item, folderIds: item.folderIds.filter(id => id !== folderId) };
        }
        return item;
    }));
    return true;
}

// Removes a ticker from the signed-in user's watchlist (Firestore only; the
// caller updates the cache/UI).
export async function deleteFromFirebase(ticker) {
    const user = auth.currentUser;
    if (!user) {
        console.error("No user is signed in.");
        return false;
    }
    try {
        await deleteDoc(doc(db, `users/${user.uid}/watchlist`, ticker));
        return true;
    } catch (error) {
        console.error("Error deleting document: ", error);
        return false;
    }
}

export function saveWatchlistItem(uid, entry) {
    return setDoc(doc(db, `users/${uid}/watchlist`, entry.ticker), entry);
}

export function saveWatchlistItemFolders(uid, ticker, folderIds) {
    return updateDoc(doc(db, `users/${uid}/watchlist`, ticker), { folderIds });
}

// Writes several complete watchlist entries in one batch.
export async function saveWatchlistItems(uid, entries) {
    const batch = writeBatch(db);
    entries.forEach((entry) => {
        batch.set(doc(db, `users/${uid}/watchlist`, entry.ticker), entry);
    });
    await batch.commit();
}

// Persists the refreshed price/band fields for many items in one batch.
export async function updateWatchlistItemValues(uid, items) {
    const batch = writeBatch(db);
    items.forEach((updatedItem) => {
        const userDocRef = doc(db, `users/${uid}/watchlist`, updatedItem.ticker);
        batch.update(userDocRef, {
            goodBuyPrice: updatedItem.goodBuyPrice,
            badBuyPrice: updatedItem.badBuyPrice,
            name: updatedItem.name,
            currentPrice: updatedItem.currentPrice,
            dividendYield: updatedItem.dividendYield,
            bandsUpdatedAt: updatedItem.bandsUpdatedAt ?? null
        });
    });
    await batch.commit();
}
