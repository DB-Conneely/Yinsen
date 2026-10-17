// Static first-party code runs in <head> before paint; no user data enters it.
export const themeBootstrap = `(function(){var p="system";try{var s=localStorage.getItem("yinsen-theme");if(s==="light"||s==="dark")p=s}catch{}document.documentElement.dataset.theme=p==="system"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):p})()`;
