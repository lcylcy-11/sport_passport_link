
const tabs = [...document.querySelectorAll('.comparison__tab')];
const panels = [...document.querySelectorAll('.concept')];
const shell = document.getElementById('preview-shell');
const toggle = document.getElementById('viewport-toggle');

function activeConcept() {
  const id = location.hash.slice(1).toLowerCase();
  return ['a', 'b', 'c'].includes(id) ? id : 'a';
}

function showConcept(active = activeConcept()) {
  tabs.forEach((tab) => {
    const selected = tab.dataset.concept === active;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
  panels.forEach((panel) => { panel.hidden = panel.id !== `concept-${active}`; });
  document.title = `DWNC — 시안 ${active.toUpperCase()}`;
}

function selectConcept(id) {
  history.replaceState(null, '', `#${id}`);
  showConcept(id);
}

tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => { selectConcept(tab.dataset.concept); });
  tab.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].focus();
    selectConcept(tabs[next].dataset.concept);
  });
});

toggle.addEventListener('click', () => {
  const mobile = shell.classList.toggle('mobile-preview');
  toggle.setAttribute('aria-pressed', String(mobile));
  toggle.querySelector('.viewport-toggle__label').textContent = mobile ? '전체 너비로 보기' : '모바일 미리보기';
});

window.addEventListener('hashchange', () => showConcept());
showConcept();
