// DOM overlays in the site's glass idiom, built locally (§9): the wordless HUD, the opening
// cruise, hints, the count-in, and the pause, results and wardrobe cards. Every button has an
// icon, so blanked strings leave the game playable (§11). Menus work with the arrows,
// Enter/Space and Esc, so no mouse is needed (§10).

import { RESTART_GUARD_SECONDS, ZONE_CYCLE, ZONE_STARTS } from '../sim/constants.js';
import { formatNumber, translate } from '../i18n/index.js';
import { HATS, SKATES } from '../save/save.js';
import { SKATE_COLORS } from '../render/models.js';
import { HAT_ICONS, ICONS } from './icons.js';

export type Toggle = 'music' | 'motion' | 'gentle';

export interface UiActions {
  pause(): void;
  resume(): void;
  restart(): void;
  toggleMute(): void;
  toggle(setting: Toggle): void;
  chooseHat(index: number): void;
  chooseSkates(index: number): void;
  rebuild(): void;
}

export interface UiSettings {
  muted: boolean;
  music: boolean;
  reducedMotion: boolean;
  gentle: boolean;
  hat: number;
  skates: number;
}

export interface RunResult {
  distance: number;
  fruit: number;
  best: number;
  newBest: boolean;
  /** The most tangerines in one run (§5), shown with a star. */
  fruitRecord: boolean;
  furthestEver: number;
}

function element<Tag extends keyof HTMLElementTagNameMap>(tag: Tag, className: string, html = ''): HTMLElementTagNameMap[Tag] {
  const node = document.createElement(tag);
  node.className = className;
  node.innerHTML = html;
  return node;
}

function iconButton(className: string, icon: string, label: string, onPress: () => void): HTMLButtonElement {
  const button = element('button', className, `<span class="icon">${icon}</span><span class="label">${label}</span>`);
  button.type = 'button';
  if (!label) button.querySelector('.label')!.remove();
  button.addEventListener('click', onPress);
  return button;
}

/** Where a distance sits along the four-icon zone strip, 0..1 (§5, §8). */
export function stripPosition(distance: number): number {
  if (distance >= ZONE_CYCLE) return 1;
  let position = 0;
  ZONE_STARTS.forEach((start, zone) => {
    const end = ZONE_STARTS[zone + 1] ?? ZONE_CYCLE;
    if (distance >= start) position = zone + Math.min(1, (distance - start) / (end - start));
  });
  return position / ZONE_STARTS.length;
}

export class Ui {
  readonly touch: HTMLDivElement;
  overlay: 'pause' | 'results' | 'wardrobe' | null = null;
  private readonly root: HTMLElement;
  private readonly distance: HTMLElement;
  private readonly fruit: HTMLElement;
  private readonly ring: HTMLElement;
  private readonly powers: Record<'bubble' | 'pinwheel', HTMLElement>;
  private readonly mute: HTMLButtonElement;
  private readonly title: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly toast: HTMLElement;
  private readonly countdown: HTMLElement;
  private readonly scrim: HTMLElement;
  private readonly rebuildButton: HTMLButtonElement;
  private lastResult: RunResult | null = null;
  private openedAt = 0;

  constructor(
    root: HTMLElement,
    private readonly actions: UiActions,
    private readonly settings: () => UiSettings,
    touchDevice: boolean,
  ) {
    this.root = root;
    this.touch = element('div', 'touch');
    this.touch.tabIndex = 0;
    this.touch.setAttribute('role', 'application');
    this.touch.setAttribute('aria-label', translate('aria.game'));

    const hud = element('div', 'hud');
    const left = element('div', 'hud-left');
    this.distance = element('div', 'pill distance', `<span class="icon">${ICONS.skate}</span><b>0</b>`);
    this.fruit = element('div', 'pill fruit', `<span class="icon">${ICONS.tangerine}</span><b>0</b>`);
    this.ring = element('div', 'pill power ring', `<span class="icon">${ICONS.ring}</span>`);
    const power = (icon: string) => element('div', 'pill power hidden', `<span class="icon">${icon}</span><svg class="drain" viewBox="0 0 40 40"><circle cx="20" cy="20" r="17"/></svg>`);
    this.powers = { bubble: power(ICONS.bubble), pinwheel: power(ICONS.pinwheel) };
    left.append(this.distance, this.fruit, this.ring, this.powers.bubble, this.powers.pinwheel);
    const right = element('div', 'hud-right');
    this.mute = iconButton('round', ICONS.soundOn, '', () => actions.toggleMute());
    right.append(this.mute, iconButton('round', ICONS.pause, '', () => actions.pause()));
    right.lastElementChild!.setAttribute('aria-label', translate('aria.pause'));
    hud.append(left, right);

    // §3: the page opens on the run, under the wordmark, with two quiet pulsing icons.
    this.title = element('div', 'title');
    const hints = touchDevice ? [ICONS.swipeSideways, ICONS.swipeUpDown] : [ICONS.keysSideways, ICONS.keysUpDown];
    this.title.innerHTML = `<div class="title-head"><div class="wordmark">Zoomway</div><div class="strip-holder"></div></div><div class="start-hints">${hints.map((icon) => `<span class="pulse">${icon}</span>`).join('')}</div>`;
    this.hint = element('div', 'slide-hint hidden', `<span class="pulse">${touchDevice ? ICONS.swipeDown : ICONS.keyDown}</span>`);
    this.toast = element('div', 'zone-toast hidden');
    this.countdown = element('div', 'countdown hidden', '<i></i><i></i><i></i>');
    this.scrim = element('div', 'scrim hidden');
    this.scrim.addEventListener('pointerup', (event) => {
      // §8: on the results card a tap anywhere (but the wardrobe button) is "again".
      if (this.overlay === 'results' && !(event.target as HTMLElement).closest('button')) this.tryRestart();
    });
    this.scrim.addEventListener('keydown', (event) => this.cardKeys(event));
    this.rebuildButton = iconButton('round big rebuild hidden', ICONS.restart, '', () => actions.rebuild());
    this.rebuildButton.setAttribute('aria-label', translate('aria.rebuild'));
    root.append(this.touch, hud, this.title, this.hint, this.toast, this.countdown, this.scrim, this.rebuildButton);
  }

  setDistance(meters: number): void {
    this.distance.querySelector('b')!.textContent = formatNumber(meters);
  }

  setFruit(count: number): void {
    this.fruit.querySelector('b')!.textContent = formatNumber(count);
    this.fruit.classList.remove('pop');
    void this.fruit.offsetWidth;
    this.fruit.classList.add('pop');
  }

  setRing(worn: boolean): void {
    this.ring.classList.toggle('spent', !worn);
  }

  /** §9: time left drains as a ring around the HUD icon. */
  setPower(kind: 'bubble' | 'pinwheel', fraction: number): void {
    const pill = this.powers[kind];
    pill.classList.toggle('hidden', fraction <= 0);
    pill.style.setProperty('--left', String(Math.max(0, fraction)));
  }

  setMuted(muted: boolean): void {
    this.mute.querySelector('.icon')!.innerHTML = muted ? ICONS.soundOff : ICONS.soundOn;
    this.mute.setAttribute('aria-label', translate(muted ? 'aria.unmute' : 'aria.mute'));
  }

  showTitle(visible: boolean, furthestEver: number): void {
    this.title.classList.toggle('gone', !visible);
    if (visible) this.title.querySelector('.strip-holder')!.replaceChildren(this.zoneStrip(furthestEver, null));
  }

  showHint(visible: boolean): void {
    this.hint.classList.toggle('hidden', !visible);
  }

  /** A zone reached for the first time slides its icon in (§5). */
  showZone(zone: number): void {
    this.toast.innerHTML = `<span class="icon">${ICONS.zones[zone]}</span><span class="label">${translate(`zone.${zone}` as 'zone.0')}</span>`;
    this.toast.classList.remove('hidden', 'slide');
    void this.toast.offsetWidth;
    this.toast.classList.add('slide');
  }

  /** The three pulsing dots that count a resumed run back in (§8); null hides them. */
  setCountdown(dotsLeft: number | null): void {
    this.countdown.classList.toggle('hidden', dotsLeft === null);
    this.countdown.querySelectorAll('i').forEach((dot, index) => dot.classList.toggle('on', dotsLeft !== null && index < dotsLeft));
  }

  showRebuild(visible: boolean): void {
    this.rebuildButton.classList.toggle('hidden', !visible);
    if (visible) this.rebuildButton.focus({ preventScroll: true });
  }

  private zoneStrip(furthestEver: number, result: RunResult | null): HTMLElement {
    const strip = element('div', 'strip');
    ZONE_STARTS.forEach((start, zone) => {
      const icon = element('span', `zone${furthestEver >= start ? '' : ' unseen'}`, ICONS.zones[zone]);
      icon.title = translate(`zone.${zone}` as 'zone.0');
      strip.append(icon);
    });
    if (result) {
      // §8: one line along the strip with two markers, this run and the flag.
      const line = element('div', 'strip-line');
      line.style.setProperty('--run', String(stripPosition(result.distance)));
      line.innerHTML = `<span class="marker run">${ICONS.tangerine}</span>${
        result.best > 0 ? `<span class="marker best" style="--at:${stripPosition(result.best)}" title="${translate('aria.best', { distance: formatNumber(result.best) })}">${ICONS.flag}</span>` : ''
      }`;
      strip.append(line);
    }
    return strip;
  }

  private card(className: string, children: HTMLElement[]): HTMLElement {
    const card = element('div', `card ${className}`);
    card.setAttribute('role', 'dialog');
    card.append(...children);
    this.scrim.replaceChildren(card);
    this.scrim.classList.remove('hidden');
    this.scrim.classList.toggle('high', className === 'card-results');
    this.root.classList.add('menu-open');
    this.openedAt = performance.now();
    card.querySelector<HTMLButtonElement>('.primary, button[aria-pressed="true"], button')?.focus({ preventScroll: true });
    return card;
  }

  openPause(): void {
    this.overlay = 'pause';
    const settings = this.settings();
    const toggle = (icon: string, label: string, pressed: boolean, onPress: () => void) => {
      const button = iconButton('toggle', icon, label, () => {
        onPress();
        button.setAttribute('aria-pressed', String(button.getAttribute('aria-pressed') !== 'true'));
      });
      button.setAttribute('aria-pressed', String(pressed));
      button.append(element('span', 'switch'));
      return button;
    };
    const title = element('h2', '', translate('pause.title'));
    const resume = iconButton('wide primary', ICONS.play, translate('pause.resume'), () => this.actions.resume());
    const restart = iconButton('wide', ICONS.restart, translate('pause.restart'), () => this.actions.restart());
    const toggles = element('div', 'toggles');
    toggles.append(
      toggle(ICONS.music, translate('settings.music'), settings.music, () => this.actions.toggle('music')),
      toggle(ICONS.soundOn, translate('settings.sound'), !settings.muted, () => this.actions.toggleMute()),
      toggle(ICONS.motion, translate('settings.motion'), settings.reducedMotion, () => this.actions.toggle('motion')),
      toggle(ICONS.turtle, translate('settings.gentle'), settings.gentle, () => this.actions.toggle('gentle')),
    );
    const buttons = element('div', 'row');
    buttons.append(resume, restart);
    this.card('card-pause', [title, buttons, toggles]);
  }

  openResults(result: RunResult): void {
    this.overlay = 'results';
    this.lastResult = result;
    const headline = element(
      'div',
      'result-distance',
      `<span class="icon">${ICONS.skate}</span><b>${formatNumber(result.distance)}</b>`,
    );
    headline.setAttribute('aria-label', translate('aria.distance', { distance: formatNumber(result.distance) }));
    const fruit = element(
      'div',
      'result-fruit',
      `<span class="icon">${ICONS.tangerine}</span><b>${formatNumber(result.fruit)}</b>${result.fruitRecord ? `<span class="icon">${ICONS.star}</span>` : ''}`,
    );
    fruit.setAttribute('aria-label', translate('aria.fruit', { count: formatNumber(result.fruit) }));
    const badge = element('div', `badge${result.newBest ? '' : ' hidden'}`, `<span class="icon">${ICONS.star}</span><span>${translate('results.newBest')}</span>`);
    const again = iconButton('again primary', ICONS.restart, translate('results.again'), () => this.tryRestart());
    const wardrobe = iconButton('wide', ICONS.hat, translate('results.wardrobe'), () => this.openWardrobe());
    const buttons = element('div', 'row');
    buttons.append(again, wardrobe);
    this.card('card-results', [badge, headline, fruit, this.zoneStrip(result.furthestEver, result), buttons]);
  }

  openWardrobe(): void {
    this.overlay = 'wardrobe';
    const settings = this.settings();
    const choose = (row: HTMLElement, selected: number, onChoose: (index: number) => void) => {
      row.querySelectorAll('button').forEach((button, index) => {
        button.setAttribute('aria-pressed', String(index === selected));
        button.addEventListener('click', () => {
          onChoose(index);
          row.querySelectorAll('button').forEach((other, otherIndex) => other.setAttribute('aria-pressed', String(otherIndex === index)));
        });
      });
    };
    const hats = element('div', 'choices');
    hats.append(...HATS.map((_, index) => iconButton('choice', HAT_ICONS[index]!, translate(`hat.${index}` as 'hat.0'), () => {})));
    choose(hats, settings.hat, (index) => this.actions.chooseHat(index));
    const skates = element('div', 'choices');
    skates.append(
      ...SKATES.map((_, index) => {
        const button = iconButton('choice swatch', ICONS.skate, translate(`skates.${index}` as 'skates.0'), () => {});
        button.style.setProperty('--swatch', `#${SKATE_COLORS[index]!.toString(16).padStart(6, '0')}`);
        return button;
      }),
    );
    choose(skates, settings.skates, (index) => this.actions.chooseSkates(index));
    const back = iconButton('wide back', ICONS.back, translate('common.back'), () => this.back());
    this.card('card-wardrobe', [
      element('h3', '', `<span class="icon">${ICONS.hat}</span>${translate('wardrobe.hats')}`),
      hats,
      element('h3', '', `<span class="icon">${ICONS.skate}</span>${translate('wardrobe.skates')}`),
      skates,
      back,
    ]);
  }

  close(): void {
    this.overlay = null;
    this.scrim.classList.add('hidden');
    this.scrim.replaceChildren();
    this.root.classList.remove('menu-open');
    this.touch.focus({ preventScroll: true });
  }

  /** Esc: one step back toward the run. */
  back(): void {
    if (this.overlay === 'pause') this.actions.resume();
    else if (this.overlay === 'wardrobe' && this.lastResult) this.openResults(this.lastResult);
  }

  tryRestart(): void {
    if (performance.now() - this.openedAt >= RESTART_GUARD_SECONDS * 1000) this.actions.restart();
  }

  private cardKeys(event: KeyboardEvent): void {
    const buttons = [...this.scrim.querySelectorAll<HTMLButtonElement>('button')];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      this.back();
    } else if (this.overlay === 'results' && (event.key === 'ArrowUp' || event.code === 'KeyW')) {
      event.preventDefault();
      this.tryRestart();
    } else if (event.key.startsWith('Arrow')) {
      event.preventDefault();
      const step = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1;
      buttons[(index + step + buttons.length) % buttons.length]?.focus();
    } else if (this.overlay === 'results' && (event.code === 'Space' || event.code === 'Enter') && index < 0) {
      event.preventDefault();
      this.tryRestart();
    }
  }

  /** Bring focus back to the open card: a click on the scrim can drop it. */
  focusCard(): void {
    this.scrim.querySelector<HTMLButtonElement>('.primary, button')?.focus({ preventScroll: true });
  }
}
