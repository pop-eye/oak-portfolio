/**
 * PortfolioOverlay — HTML/CSS modal with accessibility (focus trap, ARIA).
 */
export class PortfolioOverlay {
  constructor() {
    this.overlay = document.getElementById('portfolio-overlay');
    this.modal = this.overlay.querySelector('.portfolio-modal');
    this.mediaContainer = this.overlay.querySelector('.portfolio-media');
    this.titleEl = this.overlay.querySelector('.portfolio-title');
    this.descEl = this.overlay.querySelector('.portfolio-description');
    this.tagsEl = this.overlay.querySelector('.portfolio-tags');
    this.linkEl = this.overlay.querySelector('.portfolio-link');
    this.closeBtn = this.overlay.querySelector('.portfolio-close');

    this.isOpen = false;
    this.onClose = null;

    this.closeBtn.addEventListener('click', () => this.close());
    this.overlay.querySelector('.portfolio-backdrop')
      .addEventListener('click', () => this.close());

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) this.close();
    });

    // Focus trap inside modal
    this.modal.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab' || !this.isOpen) return;
      const focusable = this.modal.querySelectorAll(
        'button, a[href]:not(.hidden), video, iframe, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });
  }

  open(item) {
    this.isOpen = true;

    this.titleEl.textContent = item.title;
    this.descEl.textContent = item.description;
    this.overlay.setAttribute('aria-label', item.title);

    // Tags
    this.tagsEl.innerHTML = '';
    if (item.tags) {
      for (const tag of item.tags) {
        const el = document.createElement('span');
        el.className = 'portfolio-tag';
        el.textContent = tag;
        this.tagsEl.appendChild(el);
      }
    }

    // External link
    if (item.externalUrl) {
      this.linkEl.href = item.externalUrl;
      this.linkEl.style.background = item.colour;
      this.linkEl.classList.remove('hidden');
    } else {
      this.linkEl.classList.add('hidden');
    }

    // Media
    this.mediaContainer.innerHTML = '';
    this.mediaContainer.style.background = '';

    switch (item.type) {
      case 'video': {
        if (item.media?.includes('youtube') || item.media?.includes('vimeo')) {
          const iframe = document.createElement('iframe');
          iframe.src = item.media;
          iframe.allow = 'autoplay; fullscreen';
          this.mediaContainer.appendChild(iframe);
        } else {
          const video = document.createElement('video');
          video.src = item.media;
          video.controls = true;
          video.autoplay = true;
          video.muted = true;
          video.playsInline = true;
          video.poster = item.thumbnail || '';
          video.onerror = () => {
            this.mediaContainer.innerHTML = '';
            this.mediaContainer.style.background =
              `linear-gradient(135deg, ${item.colour}44, ${item.colour}22)`;
            const msg = document.createElement('p');
            msg.textContent = 'Video preview unavailable';
            msg.style.cssText = 'color: rgba(255,255,255,0.5); text-align: center; padding-top: 40%; font-family: system-ui;';
            this.mediaContainer.appendChild(msg);
          };
          this.mediaContainer.appendChild(video);
        }
        break;
      }
      case 'image': {
        const img = document.createElement('img');
        img.src = item.media;
        img.alt = item.title;
        img.loading = 'lazy';
        img.onerror = () => {
          this.mediaContainer.innerHTML = '';
          this.mediaContainer.style.background =
            `linear-gradient(135deg, ${item.colour}44, ${item.colour}22)`;
        };
        this.mediaContainer.appendChild(img);
        break;
      }
      case 'page': {
        const pageFrame = document.createElement('iframe');
        pageFrame.src = item.media;
        this.mediaContainer.appendChild(pageFrame);
        break;
      }
      case 'link':
      default: {
        if (item.thumbnail) {
          const thumb = document.createElement('img');
          thumb.src = item.thumbnail;
          thumb.alt = item.title;
          this.mediaContainer.appendChild(thumb);
        } else {
          this.mediaContainer.style.background =
            `linear-gradient(135deg, ${item.colour}44, ${item.colour}22)`;
        }
        break;
      }
    }

    this.overlay.classList.add('active');

    // Move focus into modal
    requestAnimationFrame(() => this.closeBtn.focus());

    // Update URL hash
    if (item.id) {
      window.history.replaceState(null, '', `#${item.id}`);
    }
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;

    const video = this.mediaContainer.querySelector('video');
    if (video) video.pause();

    this.overlay.classList.remove('active');

    // Clear URL hash
    window.history.replaceState(null, '', window.location.pathname);

    // Return focus to canvas
    const canvas = document.querySelector('canvas');
    if (canvas) canvas.focus();

    this.onClose?.();
  }
}
