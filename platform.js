/* KHAFAIA MVP: email accounts and persistent marketplace posts. */
(() => {
  const url = window.KHAFAIA_SUPABASE_URL || '';
  const key = window.KHAFAIA_SUPABASE_PUBLISHABLE_KEY || '';
  const configured = url.startsWith('https://') && !url.includes('YOUR-PROJECT') && key.startsWith('sb_publishable_') && !key.includes('REPLACE_WITH');
  const $ = (selector) => document.querySelector(selector);
  const state = window.khafaiaDemo;
  let db = null;
  let user = null;
  let postKind = 'supplier_offer';
  let pendingPostKind = null;
  let authMode = 'signin';

  const authBg = $('#authBg');
  const authForm = $('#authForm');
  const authMessage = $('#authMessage');
  const authButton = $('#authButton');
  const adminPanel = $('#adminPanel');
  const adminQueue = $('#adminQueue');
  const adminMessage = $('#adminMessage');

  function notify(message) {
    if (state?.showToast) state.showToast(message);
    else window.alert(message);
  }

  function setAuthMessage(message, isError = false) {
    authMessage.textContent = message;
    authMessage.style.color = isError ? '#a34737' : '#526154';
  }

  function refreshAccountButton() {
    if (!authButton) return;
    authButton.textContent = user ? 'Sign out' : 'Sign in';
    authButton.setAttribute('aria-label', user ? `Sign out ${user.email}` : 'Sign in or create an account');
    authButton.title = user?.email || 'Sign in or create an account';
  }

  function openAuth() {
    authMode = 'signin';
    $('#authTitle').textContent = 'Sign in to KHAFAIA';
    $('#authSubmit').textContent = 'Sign in';
    $('#authToggle').textContent = 'Create an account';
    setAuthMessage('Use your email to manage your palm-material posts.');
    authBg.classList.add('open');
  }

  async function loadPosts() {
    if (!db || !state?.listings) return;
    const { data, error } = await db.from('material_posts').select('id,owner_id,post_kind,category,species,quantity,unit,governorate,moisture,material_state,availability,preparation,intended_application,verification_status,created_at').eq('status', 'published').order('created_at', { ascending: false });
    if (error) {
      console.error('Could not load KHAFAIA posts:', error.message);
      return;
    }
    const locationFilter = document.querySelector('#filterLocation');
    for (const row of data || []) {
      if (![...locationFilter.options].some((option) => option.value === row.governorate)) {
        const option = document.createElement('option');
        option.value = row.governorate;
        option.textContent = row.governorate;
        locationFilter.append(option);
      }
    }

    const remote = (data || []).map((row) => ({
      recordId: row.id,
      isMine: row.owner_id === user?.id,
      title: row.post_kind === 'buyer_need' ? `${row.category} · Buyer need` : row.category,
      type: row.category,
      species: row.species || 'Not specified',
      qty: `${row.quantity} ${row.unit}`,
      location: row.governorate,
      condition: row.material_state.replace(' / unknown', ''),
      availability: row.availability || 'Availability not specified',
      prep: [row.preparation, row.intended_application ? `Intended use: ${row.intended_application}` : ''].filter(Boolean).join(' · ') || 'No preparation details provided.',
      icon: row.post_kind === 'buyer_need' ? '🔎' : '🌿',
      postKind: row.post_kind,
      verificationStatus: row.verification_status,
      isDemo: false,
    }));
    const demos = state.listings.filter((item) => item.isDemo !== false);
    state.listings.splice(0, state.listings.length, ...remote, ...demos);
    state.renderListings();
  }

  function appendAdminText(parent, tag, className, value) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = value;
    parent.append(element);
    return element;
  }

  async function refreshAdminPanel() {
    if (!adminPanel || !db || !user) {
      if (adminPanel) adminPanel.hidden = true;
      return;
    }
    const { data: adminRecord, error: adminError } = await db
      .from('admin_users')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (adminError) {
      console.error('Could not check KHAFAIA admin access:', adminError.message);
      adminPanel.hidden = true;
      return;
    }
    if (!adminRecord) {
      adminPanel.hidden = true;
      return;
    }

    adminPanel.hidden = false;
    adminMessage.textContent = 'Review each public post before verifying it. Unpublishing removes it from the marketplace.';
    adminQueue.replaceChildren();
    const { data: posts, error } = await db
      .from('material_posts')
      .select('id,post_kind,category,species,quantity,unit,governorate,moisture,material_state,availability,preparation,intended_application,verification_status,created_at')
      .eq('status', 'published')
      .in('verification_status', ['Unverified', 'Review requested'])
      .order('created_at', { ascending: false });
    if (error) {
      adminMessage.textContent = `Could not load review queue: ${error.message}`;
      return;
    }
    if (!posts?.length) {
      appendAdminText(adminQueue, 'p', 'admin-empty', 'No unverified posts are waiting for review.');
      return;
    }

    for (const post of posts) {
      const card = document.createElement('article');
      card.className = 'admin-review-item';
      const details = document.createElement('div');
      details.className = 'admin-review-details';
      appendAdminText(details, 'h3', '', `${post.category} · ${post.post_kind === 'buyer_need' ? 'Buyer need' : 'Material offer'}`);
      appendAdminText(details, 'p', '', `${post.quantity} ${post.unit} · ${post.governorate} · ${post.verification_status}`);
      appendAdminText(details, 'p', 'admin-review-meta', [post.species, post.material_state, post.moisture, post.availability, post.preparation, post.intended_application].filter(Boolean).join(' · ') || 'No extra details provided.');
      const actions = document.createElement('div');
      actions.className = 'admin-review-actions';
      const verify = document.createElement('button');
      verify.type = 'button';
      verify.className = 'btn btn-primary';
      verify.textContent = 'Mark verified';
      verify.dataset.adminAction = 'verify';
      verify.dataset.postId = post.id;
      const unpublish = document.createElement('button');
      unpublish.type = 'button';
      unpublish.className = 'btn btn-unpublish';
      unpublish.textContent = 'Unpublish';
      unpublish.dataset.adminAction = 'unpublish';
      unpublish.dataset.postId = post.id;
      actions.append(verify, unpublish);
      card.append(details, actions);
      adminQueue.append(card);
    }
  }

  async function handleAdminAction(event) {
    const button = event.target.closest('button[data-admin-action]');
    if (!button || !user || !db) return;
    const action = button.dataset.adminAction;
    if (action === 'unpublish' && !window.confirm('Unpublish this post? It will disappear from the public marketplace.')) return;
    button.disabled = true;
    adminMessage.textContent = action === 'verify' ? 'Saving verification…' : 'Unpublishing post…';
    const changes = action === 'verify'
      ? { verification_status: 'Verified' }
      : { status: 'removed' };
    const { error } = await db.from('material_posts').update(changes).eq('id', button.dataset.postId);
    if (error) {
      adminMessage.textContent = `Could not apply this action: ${error.message}`;
      button.disabled = false;
      return;
    }
    notify(action === 'verify' ? 'Post marked as verified.' : 'Post unpublished.');
    await Promise.all([refreshAdminPanel(), loadPosts()]);
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    const email = $('#authEmail').value.trim();
    const password = $('#authPassword').value;
    $('#authSubmit').disabled = true;
    setAuthMessage(authMode === 'signup' ? 'Creating your account…' : 'Signing in…');
    try {
      const result = authMode === 'signup'
        ? await db.auth.signUp({ email, password, options: { emailRedirectTo: window.location.href.split('#')[0] } })
        : await db.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      if (authMode === 'signup' && !result.data.session) {
        setAuthMessage('Check your email for the confirmation link, then return here to sign in.');
      } else {
        user = result.data.user || user;
        refreshAccountButton();
        authBg.classList.remove('open');
        authForm.reset();
        notify(authMode === 'signup' ? 'Account created and signed in.' : 'Signed in successfully.');
        if (pendingPostKind) { const next = pendingPostKind; pendingPostKind = null; openPostForm(next); }
      }
    } catch (error) {
      setAuthMessage(error.message || 'Could not complete sign-in. Please try again.', true);
    } finally {
      $('#authSubmit').disabled = false;
    }
  }

  async function handlePostSubmit(event) {
    event.preventDefault();
    if (!user) {
      notify('Sign in before posting.');
      openAuth();
      return;
    }
    const form = $('#listingForm');
    const submit = form.querySelector('[type="submit"]');
    const post = {
      post_kind: postKind,
      category: $('#newType').value,
      species: $('#postSpecies').value.trim() || null,
      quantity: Number($('#postQuantity').value),
      unit: $('#postUnit').value,
      governorate: $('#postLocation').value,
      material_state: $('#postCondition').value,
      moisture: $('#postMoisture').value,
      availability: $('#postAvailability').value.trim() || null,
      preparation: $('#postPreparation').value.trim() || null,
      intended_application: $('#postApplication').value.trim() || null,
    };
    submit.disabled = true;
    submit.textContent = 'Saving…';
    const { error } = await db.from('material_posts').insert(post);
    submit.disabled = false;
    submit.textContent = postKind === 'buyer_need' ? 'Publish buyer need' : 'Publish material offer';
    if (error) {
      notify(`Could not save this post: ${error.message}`);
      return;
    }
    form.reset();
    $('#modalBg').classList.remove('open');
    notify('Your post is published and visible in the marketplace.');
    await loadPosts();
  }

  function openPostForm(kind) {
    if (!db) {
      notify('Connect your Supabase project first. Follow SUPABASE_SETUP.md.');
      return;
    }
    if (!user) {
      postKind = kind;
      pendingPostKind = kind;
      openAuth();
      setAuthMessage('Sign in or create an account to post to the marketplace.');
      return;
    }
    postKind = kind;
    $('#listingForm').style.display = 'block';
    $('#modalTitle').textContent = kind === 'buyer_need' ? 'Post a buyer material need' : 'List palm material';
    $('#modalText').textContent = 'Posts are visible publicly after publishing. Use governorate-level location only; do not add phone numbers, emails, or private details.';
    $('#listingForm button[type=submit]').textContent = kind === 'buyer_need' ? 'Publish buyer need' : 'Publish material offer';
    $('#modalBg').classList.add('open');
  }

  function boot() {
    authButton.addEventListener('click', async () => {
      if (!db) {
        notify('The database is not connected yet. Open SUPABASE_SETUP.md and add your Supabase project URL and publishable key.');
      } else if (user) {
        const { error } = await db.auth.signOut();
        if (error) notify(error.message);
      } else {
        openAuth();
      }
    });
    $('#closeAuth').addEventListener('click', () => authBg.classList.remove('open'));
    authBg.addEventListener('click', (event) => { if (event.target === authBg) authBg.classList.remove('open'); });
    $('#authToggle').addEventListener('click', () => {
      authMode = authMode === 'signin' ? 'signup' : 'signin';
      $('#authTitle').textContent = authMode === 'signup' ? 'Create your KHAFAIA account' : 'Sign in to KHAFAIA';
      $('#authSubmit').textContent = authMode === 'signup' ? 'Create account' : 'Sign in';
      $('#authToggle').textContent = authMode === 'signup' ? 'I already have an account' : 'Create an account';
      setAuthMessage(authMode === 'signup' ? 'Email confirmation may be required before your first sign-in.' : 'Use your email to manage your palm-material posts.');
    });
    $('#listingForm').onsubmit = null;
    $('#listMaterial').onclick = null;
    $('#buyerNeed').onclick = null;
    authForm.addEventListener('submit', handleAuthSubmit);
    $('#listingForm').addEventListener('submit', handlePostSubmit);
    $('#listMaterial').addEventListener('click', (event) => { event.preventDefault(); openPostForm('supplier_offer'); });
    $('#buyerNeed').addEventListener('click', (event) => { event.preventDefault(); openPostForm('buyer_need'); });
    if (adminQueue) adminQueue.addEventListener('click', handleAdminAction);
    const adminRefresh = $('#adminRefresh');
    if (adminRefresh) adminRefresh.addEventListener('click', refreshAdminPanel);
    refreshAccountButton();

    if (!configured || !window.supabase?.createClient) {
      console.info('KHAFAIA is in local demo mode; configure Supabase to enable accounts and saved posts.');
      return;
    }

    db = window.supabase.createClient(url, key);
    db.auth.getSession().then(({ data }) => {
      user = data.session?.user || null;
      refreshAccountButton();
      Promise.all([loadPosts(), refreshAdminPanel()]);
    });
    db.auth.onAuthStateChange((_event, session) => {
      user = session?.user || null;
      refreshAccountButton();
      Promise.all([loadPosts(), refreshAdminPanel()]);
    });
  }

  window.khafaiaPlatform = { deletePost: async (id) => {
    if (!db || !user || !window.confirm('Remove this marketplace post?')) return;
    const { error } = await db.from('material_posts').delete().eq('id', id);
    if (error) notify(`Could not remove the post: ${error.message}`); else { notify('Post removed.'); await loadPosts(); }
  } };

  boot();
})();







