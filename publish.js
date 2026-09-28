/* Publish to GitHub — shared by index.html, projects.html, achievements.html
   Commits data.json (and any newly uploaded photos, into /iimages) straight
   to your repo through the GitHub API, so every device sees the change once
   GitHub Pages redeploys (~1 minute). The token is stored ONLY in this
   browser's localStorage — never put it in a file in the repo. */
(function () {
    const CFG_KEY = 'vishal_publish_cfg';
    const IMG_DIR = 'iimages';

    function cfg() {
        let c = {};
        try { c = JSON.parse(localStorage.getItem(CFG_KEY) || '{}'); } catch (e) {}
        return { owner: 'vishaldananjaya', repo: 'vishal', branch: 'main', token: '', ...c };
    }

    window.loadPublishSettings = function () {
        const c = cfg();
        ['owner', 'repo', 'branch', 'token'].forEach(k => {
            const el = document.getElementById('gh-' + k);
            if (el) el.value = c[k];
        });
    };

    window.savePublishSettings = function (silent) {
        const c = {};
        ['owner', 'repo', 'branch', 'token'].forEach(k => {
            c[k] = (document.getElementById('gh-' + k).value || '').trim();
        });
        localStorage.setItem(CFG_KEY, JSON.stringify(c));
        if (silent !== true) showToast('GitHub settings saved on this device.');
        return c;
    };

    function api(c, path, opts) {
        return fetch(`https://api.github.com/repos/${c.owner}/${c.repo}/contents/${path}`, {
            ...opts,
            headers: {
                'Accept': 'application/vnd.github+json',
                'Authorization': 'Bearer ' + c.token,
                'Content-Type': 'application/json'
            }
        });
    }

    async function getSha(c, path) {
        const r = await api(c, `${path}?ref=${encodeURIComponent(c.branch)}&t=${Date.now()}`, { method: 'GET' });
        if (r.status === 404) return null;
        if (!r.ok) throw new Error(await explain(r));
        return (await r.json()).sha;
    }

    async function putFile(c, path, base64, message) {
        const sha = await getSha(c, path);
        const body = { message, content: base64, branch: c.branch };
        if (sha) body.sha = sha;
        const r = await api(c, path, { method: 'PUT', body: JSON.stringify(body) });
        if (!r.ok) throw new Error(await explain(r));
    }

    async function explain(r) {
        let m = '';
        try { m = (await r.json()).message || ''; } catch (e) {}
        if (r.status === 401) return 'Token is invalid or expired.';
        if (r.status === 403 || r.status === 404) return `GitHub refused (${r.status}). Check owner/repo/branch and that the token has "Contents: Read and write" on this repo. ${m}`;
        return `GitHub error ${r.status}. ${m}`;
    }

    function utf8ToBase64(str) {
        const bytes = new TextEncoder().encode(str);
        let bin = '';
        bytes.forEach(b => bin += String.fromCharCode(b));
        return btoa(bin);
    }

    // Walk appData and replace every data:image URL with a repo path.
    function collectImages(data) {
        const jobs = [];
        const visit = (obj, label) => {
            if (obj && typeof obj.image === 'string' && obj.image.startsWith('data:image/')) {
                jobs.push({ holder: obj, key: 'image', label });
            }
        };
        if (data.profile) {
            const p = data.profile;
            if (typeof p.avatar === 'string' && p.avatar.startsWith('data:image/')) {
                jobs.push({ holder: p, key: 'avatar', label: 'avatar' });
            }
        }
        (data.projects || []).forEach(p => visit(p, p.title || p.id));
        (data.achievements || []).forEach(a => visit(a, a.title || a.id));
        return jobs;
    }

    function slug(s) {
        return String(s || 'photo').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'photo';
    }

    window.publishToGitHub = async function () {
        const c = savePublishSettings(true);
        if (!c.token) { showToast('Paste your GitHub token first.', 'error'); return; }

        const btn = document.getElementById('gh-publish-btn');
        const status = document.getElementById('gh-status');
        const setStatus = t => { if (status) status.textContent = t; };
        btn.disabled = true; btn.classList.add('opacity-60');

        try {
            const data = JSON.parse(JSON.stringify(appData)); // publish a copy
            const jobs = collectImages(data);

            for (let i = 0; i < jobs.length; i++) {
                const j = jobs[i];
                setStatus(`Uploading photo ${i + 1} of ${jobs.length}…`);
                const dataUrl = j.holder[j.key];
                const ext = dataUrl.startsWith('data:image/png') ? 'png' : 'jpg';
                const path = `${IMG_DIR}/${slug(j.label)}-${Date.now()}-${i}.${ext}`;
                await putFile(c, path, dataUrl.split(',')[1], `Add photo: ${path}`);
                j.holder[j.key] = path; // relative path, works on GitHub Pages
            }

            setStatus('Publishing data.json…');
            await putFile(c, 'data.json', utf8ToBase64(JSON.stringify(data, null, 2)), 'Update portfolio data from admin panel');

            // Local view now points at the repo images instead of big base64 strings.
            appData = data;
            saveAppData();
            setStatus('Published ✔ — visible on all devices in about a minute (refresh after that).');
            showToast('Published to GitHub! Live for everyone in ~1 minute.');
        } catch (err) {
            console.error(err);
            setStatus('Failed: ' + err.message);
            showToast('Publish failed: ' + err.message, 'error');
        } finally {
            btn.disabled = false; btn.classList.remove('opacity-60');
        }
    };

    document.addEventListener('DOMContentLoaded', loadPublishSettings);
})();
