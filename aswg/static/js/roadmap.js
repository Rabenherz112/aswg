// Roadmap page: kanban rendering and inline status management.
class RoadmapPage {
    constructor() {
        this.basePath = document.querySelector('meta[name="base-path"]')?.content || '';
        this.roadmapEnabled = (document.querySelector('meta[name="roadmap-enabled"]')?.content || '').toLowerCase() === 'true';
        this.removedCatalogAlerts = (document.querySelector('meta[name="roadmap-removed-catalog-alerts"]')?.content || 'true').toLowerCase() === 'true';
        this.shareUrlWarningLength = 3500;
        this.apps = [];
        this.appsById = {};
        this.catalogLoadOk = false;
        this.maxStatuses = (window.RoadmapStoreConstants && window.RoadmapStoreConstants.MAX_STATUSES) || 6;
        this.draggingAppId = null;
        this.draggingStatusId = null;
        this.autoScrollRAF = null;
        this.autoScrollEdge = 80;
        this.sharedState = null;
        this.init();
    }

    async init() {
        if (!this.roadmapEnabled || !window.RoadmapStore) {
            this.renderDisabledState();
            return;
        }

        await this.loadSearchData();
        if (this.catalogLoadOk) {
            window.RoadmapStore.reconcileAgainstCatalog(this.apps, { trackRemoved: this.removedCatalogAlerts });
        }
        this.setupEventListeners();
        await this.checkShareHash();
        if (!this.sharedState) this.renderAll();
    }

    async loadSearchData() {
        this.catalogLoadOk = false;
        try {
            const response = await fetch(this.basePath + '/static/data/search.json');
            if (!response.ok) {
                console.error('Failed to load search data: HTTP', response.status);
                this.apps = [];
                this.appsById = {};
                return;
            }
            const data = await response.json();
            this.apps = data.apps || [];
            this.appsById = {};
            this.apps.forEach((app) => { this.appsById[app.id] = app; });
            this.catalogLoadOk = true;
        } catch (error) {
            console.error('Failed to load search data:', error);
            this.apps = [];
            this.appsById = {};
        }
    }

    setupEventListeners() {
        if (window.RoadmapStoreConstants) {
            window.addEventListener(window.RoadmapStoreConstants.EVENT_NAME, () => this.renderAll());
        }

        const exportBtn = document.getElementById('roadmap-export-button');
        if (exportBtn) exportBtn.addEventListener('click', () => this.exportRoadmap());

        const importInput = document.getElementById('roadmap-import-input');
        if (importInput) importInput.addEventListener('change', (event) => this.importRoadmap(event));

        const shareBtn = document.getElementById('roadmap-share-button');
        if (shareBtn) {
            shareBtn.addEventListener('click', () => {
                this.generateShareUrl().catch((error) => {
                    console.error('[roadmap] Failed to generate share URL:', error);
                    this.showInlineMessage(shareBtn, 'Could not build a share link for this roadmap.', 'error');
                });
            });
        }

        const board = document.getElementById('roadmap-kanban-board');
        if (board) {
            board.addEventListener('dragover', (e) => this.handleBoardAutoScroll(e));
            board.addEventListener('dragleave', () => this.stopAutoScroll());
            board.addEventListener('drop', () => this.stopAutoScroll());
            board.addEventListener('dragend', () => this.stopAutoScroll());
        }

        document.addEventListener('click', (event) => {
            if (!event.target.closest('.roadmap-menu-wrapper')) {
                document.querySelectorAll('.roadmap-menu').forEach((menu) => menu.classList.add('hidden'));
            }
        });
    }

    renderAll() {
        this.renderStatusCounts();
        this.renderKanbanBoard();
        this.renderRemovedItems();
    }

    escapeHtml(str) {
        return window.AppCardHelpers.escapeHtml(str);
    }

    /**
     * Build status-id buckets of catalog app objects from an app-id to assignment map.
     */
    bucketAppsByStatus(statuses, itemsByAppId) {
        const appBuckets = {};
        statuses.forEach((status) => { appBuckets[status.id] = []; });
        Object.keys(itemsByAppId || {}).forEach((appId) => {
            const item = itemsByAppId[appId];
            if (!item || !item.status_id) return;
            const app = this.appsById[appId];
            if (!app) return;
            if (!appBuckets[item.status_id]) appBuckets[item.status_id] = [];
            appBuckets[item.status_id].push(app);
        });
        return appBuckets;
    }

    showInlineMessage(targetEl, message, type = 'error', duration = 4000) {
        if (!targetEl) return;
        const existing = targetEl.parentElement?.querySelector('.roadmap-inline-msg');
        if (existing) existing.remove();
        const msg = document.createElement('div');
        msg.className = `roadmap-inline-msg text-xs px-2 py-1 rounded mt-1 ${type === 'error' ? 'text-error bg-error/10 border border-error/30' : 'text-success bg-success/10 border border-success/30'}`;
        msg.textContent = message;
        targetEl.insertAdjacentElement('afterend', msg);
        setTimeout(() => msg.remove(), duration);
    }

    /**
     * Copy text using the Clipboard API when available, otherwise execCommand on a temporary textarea.
     */
    copyTextToClipboard(text) {
        const tryExec = () => Promise.resolve(this.copyTextViaExecCommand(text));
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            return navigator.clipboard.writeText(text).then(() => true).catch(tryExec);
        }
        return tryExec();
    }

    /**
     * Copy via document.execCommand for mobile and other environments where the Clipboard API fails.
     */
    copyTextViaExecCommand(text) {
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.setAttribute('readonly', '');
            ta.setAttribute('aria-label', 'Share link');
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            ta.style.top = '0';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            ta.setSelectionRange(0, text.length);
            const ok = document.execCommand('copy');
            document.body.removeChild(ta);
            return ok;
        } catch (err) {
            return false;
        }
    }

    /**
     * Show a readonly field with the share URL when automatic copy did not succeed.
     */
    showShareUrlFallback(url) {
        const host = document.getElementById('roadmap-share-fallback-host');
        if (!host) return;
        host.innerHTML = '';
        const input = document.createElement('input');
        input.type = 'text';
        input.readOnly = true;
        input.value = url;
        input.className = 'w-full mt-0 text-xs bg-surface-alt border border-border rounded px-2 py-2 text-text font-mono';
        host.appendChild(input);
        host.classList.remove('hidden');
        try {
            input.focus();
            input.select();
        } catch (err) {
            /* ignore */
        }
    }

    /**
     * Hide the manual share URL field shown after a failed copy attempt.
     */
    removeShareUrlFallback() {
        const host = document.getElementById('roadmap-share-fallback-host');
        if (!host) return;
        host.innerHTML = '';
        host.classList.add('hidden');
    }

    /**
     * Base64-encode a UTF-8 JSON string for URL hash fragments.
     */
    utf8JsonToBase64(jsonString) {
        const bytes = new TextEncoder().encode(jsonString);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        return btoa(binary);
    }

    /**
     * Decode a UTF-8 JSON string from utf8JsonToBase64 output.
     */
    base64ToUtf8Json(b64) {
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return new TextDecoder().decode(bytes);
    }

    /**
     * Convert byte array to URL-safe base64 without padding.
     */
    bytesToBase64Url(bytes) {
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    }

    /**
     * Convert URL-safe base64 text into a byte array.
     */
    base64UrlToBytes(encoded) {
        const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
        const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
        const binary = atob(normalized + padding);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }

    /**
     * Compress UTF-8 text with gzip and return URL-safe base64.
     */
    async gzipToBase64Url(text) {
        if (typeof CompressionStream !== 'function') throw new Error('CompressionStream unavailable');
        const input = new Blob([text], { type: 'application/json' }).stream();
        const compressedBuffer = await new Response(input.pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
        return this.bytesToBase64Url(new Uint8Array(compressedBuffer));
    }

    /**
     * Decode URL-safe base64 and inflate gzip data into UTF-8 text.
     */
    async base64UrlToGunzipText(encoded) {
        if (typeof DecompressionStream !== 'function') throw new Error('DecompressionStream unavailable');
        const compressedBytes = this.base64UrlToBytes(encoded);
        const input = new Blob([compressedBytes]).stream();
        const decodedBuffer = await new Response(input.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
        return new TextDecoder().decode(decodedBuffer);
    }

    renderDisabledState() {
        const board = document.getElementById('roadmap-kanban-board');
        if (board) board.innerHTML = '<div class="text-text-muted text-sm">Roadmap is disabled in config (`roadmap.enabled: false`).</div>';
    }

    renderStatusCounts() {
        const countsContainer = document.getElementById('roadmap-status-counts');
        const totalContainer = document.getElementById('roadmap-total-items');
        if (!countsContainer || !totalContainer) return;

        const statuses = window.RoadmapStore.listStatuses();
        const counts = window.RoadmapStore.getCounts();
        countsContainer.innerHTML = statuses.map((status) => `<span class="roadmap-status-pill">${this.escapeHtml(status.label)}: ${counts.by_status[status.id] || 0}</span>`).join('');
        totalContainer.textContent = `${counts.total} marked | ${statuses.length}/${this.maxStatuses} lanes`;
    }

    renderKanbanBoard() {
        const board = document.getElementById('roadmap-kanban-board');
        if (!board) return;

        const counts = window.RoadmapStore.getCounts();
        if (counts.total === 0) {
            const browseUrl = this.basePath + '/browse.html';
            board.innerHTML = `
                <div class="roadmap-empty-state w-full max-w-xl mx-auto py-12 px-6 text-center">
                    <p class="text-text-muted text-base mb-4">Your roadmap is empty. Add software from the catalog to plan and track what you want to run.</p>
                    <p class="text-text-muted text-sm mb-6">Open the <a href="${browseUrl}" class="text-link hover:text-link-hover font-medium">Browse</a> page, pick an application, then use the <strong>Roadmap</strong> control on its card or on the app detail page to assign it to a lane. You can also drag cards between lanes here once they are added.</p>
                    <a href="${browseUrl}" class="inline-flex items-center px-4 py-2 bg-primary hover:bg-primary-hover text-surface text-sm font-medium rounded-md transition-colors">Go to Browse</a>
                </div>
            `;
            return;
        }

        const statuses = window.RoadmapStore.listStatuses();
        const items = window.RoadmapStore.getAll();
        const appBuckets = this.bucketAppsByStatus(statuses, items);

        board.innerHTML = '';
        statuses.forEach((status) => {
            const lane = document.createElement('section');
            lane.className = 'roadmap-kanban-lane min-w-[380px] w-[380px] bg-background border border-border rounded-md p-3 flex-shrink-0 flex flex-col';
            lane.setAttribute('data-status-id', status.id);
            const laneApps = appBuckets[status.id] || [];
            lane.innerHTML = `
                <header class="flex items-center justify-between mb-2 gap-2">
                    <div class="flex items-center gap-2 min-w-0">
                        <button type="button" class="lane-drag-handle text-text-muted hover:text-text cursor-grab active:cursor-grabbing" draggable="true" data-status-id="${status.id}" title="Drag to reorder lane">:::</button>
                        <button type="button" class="lane-title-btn text-sm font-semibold text-text truncate" data-status-id="${status.id}" title="Click to rename lane">${this.escapeHtml(status.label)}</button>
                    </div>
                    <div class="flex items-center gap-1 flex-shrink-0">
                        <span class="text-xs text-text-muted">${laneApps.length}</span>
                        <button type="button" class="lane-move-left-btn roadmap-mobile-move inline-flex items-center justify-center w-7 h-7 rounded text-text-muted hover:text-text hover:bg-surface-alt" data-status-id="${status.id}" title="Move lane left" aria-label="Move lane left">
                            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
                        </button>
                        <button type="button" class="lane-move-right-btn roadmap-mobile-move inline-flex items-center justify-center w-7 h-7 rounded text-text-muted hover:text-text hover:bg-surface-alt" data-status-id="${status.id}" title="Move lane right" aria-label="Move lane right">
                            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                        </button>
                        <button type="button" class="lane-delete-btn inline-flex items-center justify-center w-8 h-8 rounded-md text-text-muted hover:text-error hover:bg-surface-alt" data-status-id="${status.id}" title="Delete lane" aria-label="Delete lane">
                            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3M4 7h16" />
                            </svg>
                        </button>
                    </div>
                </header>
                <div class="roadmap-lane-cards space-y-3 min-h-[120px] flex-1 flex flex-col"></div>
            `;

            const cardsContainer = lane.querySelector('.roadmap-lane-cards');
            if (laneApps.length === 0) {
                cardsContainer.innerHTML = '<div class="roadmap-empty-placeholder text-xs text-text-muted border border-dashed border-border rounded p-3 flex-1 flex items-center justify-center text-center min-h-[120px]">Drop cards here.</div>';
            } else {
                laneApps.forEach((app) => cardsContainer.appendChild(this.createRoadmapCard(app)));
            }

            this.bindLaneDrop(cardsContainer, status.id);
            this.bindLaneReorderDrop(lane, status.id);
            board.appendChild(lane);
        });

        if (statuses.length < this.maxStatuses) {
            const addLane = document.createElement('section');
            addLane.className = 'roadmap-kanban-lane-add min-w-[380px] w-[380px] border-2 border-dashed border-border rounded-md p-3 flex-shrink-0 bg-background/50 flex flex-col';
            addLane.innerHTML = `
                <button type="button" id="roadmap-add-lane-button" class="w-full flex-1 min-h-[120px] flex items-center justify-center text-sm text-text-muted hover:text-text">
                    + Add Lane
                </button>
            `;
            board.appendChild(addLane);
            const addBtn = addLane.querySelector('#roadmap-add-lane-button');
            if (addBtn) {
                addBtn.addEventListener('click', () => this.handleAddLane());
            }
        }

        this.bindLaneHeaderControls();
    }

    bindLaneHeaderControls() {
        document.querySelectorAll('.lane-title-btn').forEach((button) => {
            button.addEventListener('click', () => this.startRenameLane(button));
        });
        document.querySelectorAll('.lane-delete-btn').forEach((button) => {
            button.addEventListener('click', () => this.handleRemoveStatus(button.getAttribute('data-status-id')));
        });
        document.querySelectorAll('.lane-move-left-btn').forEach((btn) => {
            btn.addEventListener('click', () => this.moveLaneDirection(btn.getAttribute('data-status-id'), -1));
        });
        document.querySelectorAll('.lane-move-right-btn').forEach((btn) => {
            btn.addEventListener('click', () => this.moveLaneDirection(btn.getAttribute('data-status-id'), 1));
        });
        document.querySelectorAll('.lane-drag-handle').forEach((handle) => {
            handle.addEventListener('dragstart', (event) => {
                this.draggingStatusId = handle.getAttribute('data-status-id');
                if (event.dataTransfer) {
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/status-id', this.draggingStatusId || '');
                }
            });
            handle.addEventListener('dragend', () => {
                this.draggingStatusId = null;
                document.querySelectorAll('.roadmap-lane-drop-target').forEach((el) => el.classList.remove('roadmap-lane-drop-target'));
            });
        });
    }

    bindLaneReorderDrop(lane, targetStatusId) {
        lane.addEventListener('dragover', (event) => {
            if (!this.draggingStatusId) return;
            event.preventDefault();
            lane.classList.add('roadmap-lane-drop-target');
        });
        lane.addEventListener('dragleave', () => {
            lane.classList.remove('roadmap-lane-drop-target');
        });
        lane.addEventListener('drop', (event) => {
            if (!this.draggingStatusId) return;
            event.preventDefault();
            lane.classList.remove('roadmap-lane-drop-target');
            this.reorderLaneBefore(this.draggingStatusId, targetStatusId);
        });
    }

    bindLaneDrop(container, statusId) {
        container.addEventListener('dragover', (event) => {
            if (!this.draggingAppId) return;
            event.preventDefault();
            container.classList.add('roadmap-lane-cards-drop-target');
        });
        container.addEventListener('dragleave', () => {
            container.classList.remove('roadmap-lane-cards-drop-target');
        });
        container.addEventListener('drop', (event) => {
            if (!this.draggingAppId) return;
            event.preventDefault();
            container.classList.remove('roadmap-lane-cards-drop-target');
            window.RoadmapStore.setStatus(this.draggingAppId, statusId);
            this.draggingAppId = null;
        });
    }

    moveLaneDirection(statusId, direction) {
        const statuses = window.RoadmapStore.listStatuses();
        const idx = statuses.findIndex(s => s.id === statusId);
        if (idx < 0) return;
        const newIdx = idx + direction;
        if (newIdx < 0 || newIdx >= statuses.length) return;
        const ids = statuses.map(s => s.id);
        [ids[idx], ids[newIdx]] = [ids[newIdx], ids[idx]];
        window.RoadmapStore.reorderStatuses(ids);
    }

    reorderLaneBefore(draggedId, targetId) {
        if (!draggedId || !targetId || draggedId === targetId) return;
        const statuses = window.RoadmapStore.listStatuses();
        const dragged = statuses.find((status) => status.id === draggedId);
        const target = statuses.find((status) => status.id === targetId);
        if (!dragged || !target) return;
        const filtered = statuses.filter((status) => status.id !== draggedId);
        const insertIndex = filtered.findIndex((status) => status.id === targetId);
        if (insertIndex < 0) return;
        filtered.splice(insertIndex, 0, dragged);
        window.RoadmapStore.reorderStatuses(filtered.map((status) => status.id));
    }

    handleAddLane() {
        const statuses = window.RoadmapStore.listStatuses();
        const addBtn = document.getElementById('roadmap-add-lane-button');
        if (!addBtn) return;

        if (statuses.length >= this.maxStatuses) {
            this.showInlineMessage(addBtn, `Maximum of ${this.maxStatuses} lanes reached.`);
            return;
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'flex flex-col gap-2 p-2';
        wrapper.innerHTML = `
            <label class="text-xs text-text-muted font-medium">New lane name</label>
            <input type="text" maxlength="40" placeholder="e.g. Testing, Deployed..." class="w-full px-2 py-1 text-sm bg-surface-alt border border-border rounded text-text" />
            <div class="roadmap-add-lane-feedback text-xs hidden"></div>
            <div class="flex gap-2">
                <button type="button" class="roadmap-add-lane-confirm bg-primary hover:bg-primary-hover text-surface text-xs font-medium px-3 py-1.5 rounded transition-colors">Add</button>
                <button type="button" class="roadmap-add-lane-cancel bg-surface-alt border border-border hover:bg-secondary text-text text-xs px-3 py-1.5 rounded transition-colors">Cancel</button>
            </div>
        `;

        addBtn.replaceWith(wrapper);
        const input = wrapper.querySelector('input');
        const feedback = wrapper.querySelector('.roadmap-add-lane-feedback');
        input.focus();

        const commit = () => {
            const name = input.value.trim();
            if (!name) {
                this.renderAll();
                return;
            }
            const beforeCount = window.RoadmapStore.listStatuses().length;
            window.RoadmapStore.addStatus(name);
            const afterCount = window.RoadmapStore.listStatuses().length;
            if (afterCount === beforeCount) {
                feedback.textContent = 'A lane with that name already exists.';
                feedback.className = 'roadmap-add-lane-feedback text-xs text-error';
                feedback.classList.remove('hidden');
                input.focus();
            }
        };

        wrapper.querySelector('.roadmap-add-lane-confirm').addEventListener('click', commit);
        wrapper.querySelector('.roadmap-add-lane-cancel').addEventListener('click', () => this.renderAll());
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') commit();
            if (event.key === 'Escape') this.renderAll();
        });
    }

    startRenameLane(button) {
        const statusId = button.getAttribute('data-status-id');
        if (!statusId) return;
        const currentLabel = button.textContent || '';
        let renameCancelled = false;
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'w-full px-2 py-1 text-sm bg-surface-alt border border-border rounded text-text';
        input.value = currentLabel;
        input.maxLength = 40;
        button.replaceWith(input);
        input.focus();
        input.select();

        const commit = () => {
            if (renameCancelled) return;
            const next = input.value.trim();
            if (next && next !== currentLabel) {
                const beforeLabel = window.RoadmapStore.listStatuses().find(s => s.id === statusId)?.label;
                window.RoadmapStore.renameStatus(statusId, next);
                const afterLabel = window.RoadmapStore.listStatuses().find(s => s.id === statusId)?.label;
                if (afterLabel === beforeLabel && next !== beforeLabel) {
                    this.showInlineMessage(input, 'A lane with that name already exists.');
                    input.focus();
                    input.addEventListener('blur', onBlur, { once: true });
                    return;
                }
            } else {
                this.renderAll();
            }
        };

        const onBlur = () => {
            if (renameCancelled) return;
            commit();
        };
        input.addEventListener('blur', onBlur, { once: true });
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                input.removeEventListener('blur', onBlur);
                commit();
            }
            if (event.key === 'Escape') {
                event.preventDefault();
                renameCancelled = true;
                input.removeEventListener('blur', onBlur);
                this.renderAll();
            }
        });
    }

    handleRemoveStatus(statusId) {
        const statuses = window.RoadmapStore.listStatuses();
        const target = statuses.find((status) => status.id === statusId);
        if (!target) return;
        const others = statuses.filter((status) => status.id !== statusId);
        const items = window.RoadmapStore.getAll();
        const hasAssignments = Object.values(items).some((item) => item.status_id === statusId);

        if (!hasAssignments) {
            window.RoadmapStore.removeStatus(statusId, null);
            return;
        }

        if (!others.length) {
            const deleteBtn = document.querySelector(`.lane-delete-btn[data-status-id="${statusId}"]`);
            if (deleteBtn) this.showInlineMessage(deleteBtn, 'Cannot remove the last lane while it has assigned items.');
            return;
        }

        const lane = document.querySelector(`.roadmap-kanban-lane[data-status-id="${statusId}"]`);
        if (!lane) return;

        const existing = lane.querySelector('.roadmap-delete-panel');
        if (existing) { existing.remove(); return; }

        const panel = document.createElement('div');
        panel.className = 'roadmap-delete-panel bg-surface-alt border border-border rounded-md p-3 mb-2';
        const optionsHtml = others.map((status) =>
            `<label class="flex items-center gap-2 text-xs text-text cursor-pointer py-1">
                <input type="radio" name="move-target-${statusId}" value="${status.id}" class="accent-primary" />
                ${this.escapeHtml(status.label)}
            </label>`
        ).join('');
        panel.innerHTML = `
            <p class="text-xs text-text-muted mb-2">Move items from <strong>${this.escapeHtml(target.label)}</strong> to:</p>
            ${optionsHtml}
            <div class="flex gap-2 mt-2">
                <button type="button" class="roadmap-delete-confirm bg-error hover:bg-error/80 text-surface text-xs font-medium px-3 py-1.5 rounded transition-colors">Delete Lane</button>
                <button type="button" class="roadmap-delete-cancel bg-surface-alt border border-border hover:bg-secondary text-text text-xs px-3 py-1.5 rounded transition-colors">Cancel</button>
            </div>
        `;

        const header = lane.querySelector('header');
        if (header) header.insertAdjacentElement('afterend', panel);

        panel.querySelector('.roadmap-delete-confirm').addEventListener('click', () => {
            const selected = panel.querySelector(`input[name="move-target-${statusId}"]:checked`);
            if (!selected) {
                this.showInlineMessage(panel.querySelector('.roadmap-delete-confirm'), 'Select a target lane first.');
                return;
            }
            window.RoadmapStore.removeStatus(statusId, selected.value);
        });
        panel.querySelector('.roadmap-delete-cancel').addEventListener('click', () => panel.remove());
    }

    /**
     * Shared options passed to renderAppCard for catalog cards on the roadmap page.
     */
    getSharedAppCardConfig(app) {
        return {
            app: app,
            basePath: this.basePath,
            openExternalInNewTab: (document.querySelector('meta[name="open-external-new-tab"]')?.content || '').toLowerCase() === 'true',
            openInternalInNewTab: (document.querySelector('meta[name="open-internal-new-tab"]')?.content || '').toLowerCase() === 'true',
            formatStars: this.formatStars.bind(this),
            getDaysSinceUpdate: this.getDaysSinceUpdate.bind(this),
            getUpdateAgeColor: this.getUpdateAgeColor.bind(this),
            truncateDescription: this.truncateDescription.bind(this),
            getPlatformColor: this.getPlatformColor.bind(this),
            isNonFreeLicense: this.isNonFreeLicense.bind(this),
            maxCategoriesPerCard: this.getMetaInt('browse-max-categories-per-card', 2),
            maxPlatformsPerCard: this.getMetaInt('browse-max-platforms-per-card', 3)
        };
    }

    createRoadmapCard(app) {
        const card = window.renderAppCard({
            ...this.getSharedAppCardConfig(app),
            getRoadmapControlHtml: this.getRoadmapControlHtml.bind(this),
            onCardCreated: (card, createdApp) => {
                this.bindRoadmapControls(card, createdApp);
                this.bindCardDrag(card, createdApp);
            }
        });
        // Browse cards use h-full for grid equalization; roadmap lanes need natural card height.
        card.classList.remove('h-full');
        card.classList.add('h-auto');
        return card;
    }

    bindCardDrag(card, app) {
        card.setAttribute('draggable', 'true');
        card.setAttribute('data-app-id', app.id);
        card.addEventListener('dragstart', (event) => {
            this.draggingAppId = app.id;
            if (event.dataTransfer) {
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/app-id', app.id);
            }
        });
        card.addEventListener('dragend', () => {
            this.draggingAppId = null;
            document.querySelectorAll('.roadmap-lane-cards-drop-target').forEach((el) => el.classList.remove('roadmap-lane-cards-drop-target'));
        });
    }

    handleBoardAutoScroll(event) {
        const board = document.getElementById('roadmap-kanban-board');
        if (!board || (!this.draggingAppId && !this.draggingStatusId)) return;

        const rect = board.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const edge = this.autoScrollEdge;
        let speed = 0;

        if (x < edge) {
            speed = -(edge - x) * 0.5;
        } else if (x > rect.width - edge) {
            speed = (x - (rect.width - edge)) * 0.5;
        }

        if (speed === 0) {
            this.stopAutoScroll();
            return;
        }

        if (this.autoScrollRAF) return;

        const scroll = () => {
            board.scrollLeft += speed;
            this.autoScrollRAF = requestAnimationFrame(scroll);
        };
        this.autoScrollRAF = requestAnimationFrame(scroll);
    }

    stopAutoScroll() {
        if (this.autoScrollRAF) {
            cancelAnimationFrame(this.autoScrollRAF);
            this.autoScrollRAF = null;
        }
    }

    getRoadmapControlHtml(app) {
        const statuses = window.RoadmapStore.listStatuses();
        const currentStatusId = window.RoadmapStore.getStatus(app.id);
        const current = statuses.find((status) => status.id === currentStatusId);
        const currentLabel = current ? this.escapeHtml(current.label) : 'Unassigned';
        const optionsHtml = statuses.map((status) => `<button type="button" class="roadmap-menu-item w-full text-left px-3 py-2 text-xs hover:bg-surface-alt text-text-muted" data-status-id="${status.id}">${this.escapeHtml(status.label)}</button>`).join('');
        return `
            <div class="roadmap-menu-wrapper relative inline-block" data-app-id="${app.id}">
                <button type="button" class="roadmap-toggle-btn inline-flex items-center text-link hover:text-link-hover font-medium">
                    Roadmap
                    <svg class="w-3 h-3 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                </button>
                <div class="roadmap-menu hidden absolute left-0 bottom-full mb-1 w-48 bg-surface border border-border rounded-md shadow-lg z-30">
                    <div class="px-3 py-2 text-[11px] text-text-muted border-b border-border">Current: ${currentLabel}</div>
                    ${optionsHtml}
                    <div class="border-t border-border my-0.5"></div>
                    <button type="button" class="roadmap-menu-clear w-full text-left px-3 py-2 text-xs hover:bg-surface-alt text-text-muted">Clear status</button>
                </div>
            </div>
        `;
    }

    bindRoadmapControls(card, app) {
        const wrapper = card.querySelector('.roadmap-menu-wrapper');
        if (!wrapper) return;
        const toggleBtn = wrapper.querySelector('.roadmap-toggle-btn');
        const menu = wrapper.querySelector('.roadmap-menu');
        if (toggleBtn && menu) {
            toggleBtn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                const willOpen = menu.classList.contains('hidden');
                document.querySelectorAll('.roadmap-menu').forEach((menuEl) => menuEl.classList.add('hidden'));
                if (willOpen) menu.classList.remove('hidden');
            });
        }
        wrapper.querySelectorAll('.roadmap-menu-item').forEach((button) => {
            button.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                const statusId = event.currentTarget.getAttribute('data-status-id');
                if (statusId) window.RoadmapStore.setStatus(app.id, statusId);
            });
        });
        const clearButton = wrapper.querySelector('.roadmap-menu-clear');
        if (clearButton) {
            clearButton.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                window.RoadmapStore.clearStatus(app.id);
            });
        }
    }

    renderRemovedItems() {
        const section = document.getElementById('roadmap-removed-section');
        const container = document.getElementById('roadmap-removed-items');
        if (!section || !container) return;

        if (!this.removedCatalogAlerts) {
            section.classList.add('hidden');
            container.innerHTML = '';
            return;
        }

        const removed = window.RoadmapStore.getRemovedItems();
        const ids = Object.keys(removed);
        if (!ids.length) {
            section.classList.add('hidden');
            container.innerHTML = '';
            return;
        }

        section.classList.remove('hidden');
        const statuses = window.RoadmapStore.listStatuses();
        container.innerHTML = ids.map((appId) => {
            const item = removed[appId];
            const status = statuses.find((entry) => entry.id === item.status_id);
            return `
                <div class="border border-border rounded-md p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                        <div class="text-sm font-medium text-text">${this.escapeHtml(item.name_snapshot)}</div>
                        <div class="text-xs text-text-muted">Previous status: ${status ? this.escapeHtml(status.label) : 'Unassigned'} | Removed: ${this.formatDate(item.removed_at)}</div>
                    </div>
                    <button type="button" class="removed-item-clear shrink-0 text-xs font-medium px-3 py-1.5 rounded-md bg-surface-alt border border-border text-text hover:bg-secondary transition-colors" data-app-id="${appId}">Unmark</button>
                </div>
            `;
        }).join('');

        container.querySelectorAll('.removed-item-clear').forEach((button) => {
            button.addEventListener('click', (event) => {
                const appId = event.currentTarget.getAttribute('data-app-id');
                if (appId) window.RoadmapStore.clearRemovedItem(appId);
            });
        });
    }

    exportRoadmap() {
        const state = window.RoadmapStore.getState();
        const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'aswg-roadmap.json';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    importRoadmap(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (loadEvent) => {
            try {
                const imported = JSON.parse(loadEvent.target.result);
                window.RoadmapStore.saveState(imported);
            } catch (error) {
                const importBtn = document.querySelector('label[for="roadmap-import-input"]');
                if (importBtn) this.showInlineMessage(importBtn, 'Invalid roadmap JSON file.');
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    }

    async generateShareUrl() {
        const shareBtn = document.getElementById('roadmap-share-button');
        const state = window.RoadmapStore.getState();
        const payload = {
            statuses: state.statuses.map(s => ({ id: s.id, label: s.label, order: s.order })),
            items: {}
        };
        Object.keys(state.items).forEach(appId => {
            payload.items[appId] = { status_id: state.items[appId].status_id };
        });
        try {
            const json = JSON.stringify(payload);
            let hashPayload = 'b64:' + this.utf8JsonToBase64(json);
            if (typeof CompressionStream === 'function') {
                try {
                    hashPayload = 'gz:' + await this.gzipToBase64Url(json);
                } catch (error) {
                    console.warn('[roadmap] Compression failed, using base64 fallback:', error);
                }
            }

            const url = window.location.origin + window.location.pathname + '#share=' + hashPayload;
            const urlTooLong = url.length > this.shareUrlWarningLength;
            const copied = await this.copyTextToClipboard(url);
            if (copied) {
                this.removeShareUrlFallback();
                if (shareBtn) {
                    if (urlTooLong) {
                        this.showInlineMessage(shareBtn, 'Link copied, but it is very long and may fail in some browsers.', 'error', 6000);
                    } else {
                        this.showInlineMessage(shareBtn, 'Link copied to clipboard!', 'success');
                    }
                }
                return;
            }

            if (shareBtn) {
                const failureMsg = urlTooLong
                    ? 'Select the long link below and copy it manually. Some browsers may reject very long URLs.'
                    : 'Select the link in the box below, then copy (long links work best this way on mobile).';
                this.showInlineMessage(shareBtn, failureMsg, 'error', 6000);
                this.showShareUrlFallback(url);
            }
        } catch (error) {
            console.error('[roadmap] Failed to generate share URL:', error);
            if (shareBtn) this.showInlineMessage(shareBtn, 'Could not build a share link for this roadmap.', 'error');
        }
    }

    async checkShareHash() {
        const hash = window.location.hash;
        if (!hash.startsWith('#share=')) return;

        try {
            const encoded = hash.substring(7);
            let json = '';
            if (encoded.startsWith('gz:')) {
                json = await this.base64UrlToGunzipText(encoded.substring(3));
            } else if (encoded.startsWith('b64:')) {
                json = this.base64ToUtf8Json(encoded.substring(4));
            } else {
                json = this.base64ToUtf8Json(encoded);
            }
            const shared = JSON.parse(json);
            if (!shared || !Array.isArray(shared.statuses)) return;

            this.sharedState = shared;
            this.renderSharedPreview();
        } catch (error) {
            console.error('[roadmap] Failed to parse share hash:', error);
        }
    }

    renderSharedPreview() {
        const banner = document.getElementById('roadmap-share-banner');
        if (banner) banner.classList.remove('hidden');

        const board = document.getElementById('roadmap-kanban-board');
        if (!board) return;

        const shared = this.sharedState;
        const statuses = shared.statuses.sort((a, b) => a.order - b.order);
        const appBuckets = this.bucketAppsByStatus(statuses, shared.items || {});

        board.innerHTML = '';
        statuses.forEach(status => {
            const lane = document.createElement('section');
            lane.className = 'roadmap-kanban-lane min-w-[380px] w-[380px] bg-background border border-border rounded-md p-3 flex-shrink-0 flex flex-col opacity-80';
            const laneApps = appBuckets[status.id] || [];
            lane.innerHTML = `
                <header class="flex items-center justify-between mb-2 gap-2">
                    <div class="flex items-center gap-2 min-w-0">
                        <span class="text-sm font-semibold text-text truncate">${this.escapeHtml(status.label)}</span>
                    </div>
                    <span class="text-xs text-text-muted">${laneApps.length}</span>
                </header>
                <div class="roadmap-lane-cards space-y-3 min-h-[120px] flex-1 flex flex-col"></div>
            `;
            const cardsContainer = lane.querySelector('.roadmap-lane-cards');
            if (laneApps.length === 0) {
                cardsContainer.innerHTML = '<div class="text-xs text-text-muted border border-dashed border-border rounded p-3 flex-1 flex items-center justify-center text-center min-h-[80px]">Empty</div>';
            } else {
                laneApps.forEach(app => {
                    const card = this.createPreviewCard(app);
                    cardsContainer.appendChild(card);
                });
            }
            board.appendChild(lane);
        });

        this.renderStatusCountsFromShared(statuses, shared.items || {});
        this.bindShareBannerActions();
    }

    createPreviewCard(app) {
        const card = window.renderAppCard({
            ...this.getSharedAppCardConfig(app),
            getRoadmapControlHtml: () => '',
            onCardCreated: () => {}
        });
        card.classList.remove('h-full');
        card.classList.add('h-auto');
        card.setAttribute('draggable', 'false');
        card.style.pointerEvents = 'auto';
        return card;
    }

    renderStatusCountsFromShared(statuses, items) {
        const countsContainer = document.getElementById('roadmap-status-counts');
        const totalContainer = document.getElementById('roadmap-total-items');
        if (!countsContainer || !totalContainer) return;

        const counts = {};
        statuses.forEach(s => { counts[s.id] = 0; });
        Object.values(items).forEach(item => {
            if (counts[item.status_id] !== undefined) counts[item.status_id] += 1;
        });
        const total = Object.keys(items).length;

        countsContainer.innerHTML = statuses.map(s => `<span class="roadmap-status-pill">${this.escapeHtml(s.label)}: ${counts[s.id] || 0}</span>`).join('');
        totalContainer.textContent = `${total} items (shared preview)`;
    }

    bindShareBannerActions() {
        const banner = document.getElementById('roadmap-share-banner');
        if (!banner || banner.dataset.roadmapShareBound === '1') return;
        banner.dataset.roadmapShareBound = '1';
        banner.addEventListener('click', (event) => {
            const btn = event.target.closest('button');
            if (!btn) return;
            if (btn.id === 'roadmap-share-replace') {
                const shared = this.sharedState;
                const newState = window.RoadmapStore.getState();
                newState.statuses = shared.statuses.map((s, i) => ({
                    id: s.id, label: s.label, order: i, builtin: false
                }));
                newState.items = {};
                Object.keys(shared.items || {}).forEach(appId => {
                    newState.items[appId] = {
                        status_id: shared.items[appId].status_id,
                        updated_at: new Date().toISOString()
                    };
                });
                window.RoadmapStore.saveState(newState);
                this.dismissShare();
            } else if (btn.id === 'roadmap-share-merge') {
                const shared = this.sharedState;
                const state = window.RoadmapStore.getState();
                const existingIds = new Set(state.statuses.map(s => s.id));
                shared.statuses.forEach(s => {
                    if (!existingIds.has(s.id) && state.statuses.length < this.maxStatuses) {
                        state.statuses.push({
                            id: s.id, label: s.label, order: state.statuses.length, builtin: false
                        });
                        existingIds.add(s.id);
                    }
                });
                Object.keys(shared.items || {}).forEach(appId => {
                    if (!state.items[appId]) {
                        const statusId = shared.items[appId].status_id;
                        if (existingIds.has(statusId)) {
                            state.items[appId] = {
                                status_id: statusId,
                                updated_at: new Date().toISOString()
                            };
                        }
                    }
                });
                window.RoadmapStore.saveState(state);
                this.dismissShare();
            } else if (btn.id === 'roadmap-share-dismiss') {
                this.dismissShare();
            }
        });
    }

    dismissShare() {
        this.sharedState = null;
        history.replaceState(null, '', window.location.pathname + window.location.search);
        const banner = document.getElementById('roadmap-share-banner');
        if (banner) banner.classList.add('hidden');
        this.renderAll();
    }

    getMetaInt(name, fallbackValue) {
        const meta = document.querySelector(`meta[name="${name}"]`);
        if (!meta) return fallbackValue;
        const parsed = parseInt(meta.content, 10);
        return isNaN(parsed) ? fallbackValue : parsed;
    }

    isNonFreeLicense(licenses) {
        if (!licenses || licenses.length === 0) return false;
        const set = new Set(['⊘ Proprietary']);
        return licenses.some((license) => set.has(license));
    }

    formatStars(stars) {
        return window.AppCardHelpers.formatStars(stars);
    }

    getDaysSinceUpdate(lastUpdated) {
        return window.AppCardHelpers.getDaysSinceUpdate(lastUpdated);
    }

    getUpdateAgeColor(days) {
        return window.AppCardHelpers.getUpdateAgeColor(days);
    }

    truncateDescription(description) {
        const maxLength = this.getMetaInt('browse-description-length', 90);
        const browseDescriptionFull = document.querySelector('meta[name="browse-description-full"]')?.content === 'true';
        if (!description) return '';
        if (browseDescriptionFull || description.length <= maxLength) return description;
        const truncated = description.substring(0, maxLength).trim();
        const lastSpace = truncated.lastIndexOf(' ');
        const finalText = lastSpace > 0 ? truncated.substring(0, lastSpace) : truncated;
        return finalText + '...';
    }

    getPlatformColor(platform) {
        return window.AppCardHelpers.getPlatformColor(platform);
    }

    formatDate(isoDate) {
        if (!isoDate) return 'Unknown';
        const date = new Date(isoDate);
        if (isNaN(date.getTime())) return 'Unknown';
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new RoadmapPage();
});
