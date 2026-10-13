// Generic "are you sure?" modal used before removing a ticker from the
// watch list — `execute` performs the actual Firestore delete + DOM/cache
// cleanup once the user confirms.
let deleteConfirmModalOverlay    = document.getElementById("deleteConfirmModalOverlay");
let deleteConfirmModalMessage    = document.getElementById("deleteConfirmModalMessage");
let deleteConfirmModalCloseBtn   = document.getElementById("deleteConfirmModalCloseBtn");
let deleteConfirmModalCancelBtn  = document.getElementById("deleteConfirmModalCancelBtn");
let deleteConfirmModalConfirmBtn = document.getElementById("deleteConfirmModalConfirmBtn");

// Holds the callback for whichever delete action is currently pending confirmation.
let pendingDeleteAction     = null;

if (deleteConfirmModalOverlay) {
    deleteConfirmModalCloseBtn.addEventListener('click', closeDeleteConfirmModal);
    deleteConfirmModalCancelBtn.addEventListener('click', closeDeleteConfirmModal);
    deleteConfirmModalOverlay.addEventListener('click', function (event) {
        if (event.target === deleteConfirmModalOverlay) {
            closeDeleteConfirmModal();
        }
    });
    deleteConfirmModalConfirmBtn.addEventListener('click', async function () {
        if (!pendingDeleteAction) return;
        const execute = pendingDeleteAction;
        deleteConfirmModalConfirmBtn.disabled = true;
        await execute();
        deleteConfirmModalConfirmBtn.disabled = false;
        closeDeleteConfirmModal();
    });
}

export function openDeleteConfirmModal(ticker, execute) {
    pendingDeleteAction = execute;
    deleteConfirmModalMessage.textContent = `Remove ${ticker} from your watch list?`;
    deleteConfirmModalOverlay.classList.remove('hidden');
}

function closeDeleteConfirmModal() {
    deleteConfirmModalOverlay.classList.add('hidden');
    pendingDeleteAction = null;
}
