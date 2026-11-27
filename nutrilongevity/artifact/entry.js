// Entry for the published claude.ai build: the regular app plus a store-error notice.
import { toast } from '../public/js/ui.js';
import '../public/js/app.js';

document.addEventListener('nl-store-error', (e) => toast(e.detail, 'err'));
