(() => {
  const form = document.querySelector('form[data-hoahub-logout-transition="true"]');
  if (form instanceof HTMLFormElement) HTMLFormElement.prototype.submit.call(form);
})();
