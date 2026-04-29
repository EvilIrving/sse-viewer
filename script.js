function showPage(pageId) {
  const main = document.querySelector('main');
  const allPages = document.querySelectorAll('.page');
  const allLinks = document.querySelectorAll('.nav-link');
  const hash = pageId === 'landing' ? '#' : '#privacy';

  for (const page of allPages) page.classList.remove('active');
  document.getElementById(pageId).classList.add('active');

  for (const link of allLinks) {
    const isActive = link.dataset.page === pageId;
    link.classList.toggle('active', isActive);
    link.setAttribute('aria-current', isActive ? 'page' : 'false');
  }

  window.scrollTo(0, 0);
  main.focus();
  history.pushState(null, '', hash);
}

window.addEventListener('DOMContentLoaded', () => {
  const initialPage = location.hash === '#privacy' ? 'privacy' : 'landing';
  document.getElementById(initialPage).classList.add('active');
  const initialLink = document.querySelector(`[data-page="${initialPage}"]`);
  if (initialLink) {
    initialLink.classList.add('active');
    initialLink.setAttribute('aria-current', 'page');
  }
});

window.addEventListener('hashchange', () => {
  const page = location.hash === '#privacy' ? 'privacy' : 'landing';
  showPage(page);
});
