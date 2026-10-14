import { cloneElement, isValidElement } from 'react';
import brlIconUrl from './brl-symbol.svg';

export const BRL_ICON_PATH = brlIconUrl;

let iconImage;
let iconImagePromise;

/** Preload the same green symbol used by cards before drawing the 3D canvas labels. */
export function loadBRLIconImage() {
  if (iconImage?.complete && iconImage.naturalWidth > 0) return Promise.resolve(iconImage);
  if (iconImagePromise) return iconImagePromise;
  if (typeof Image === 'undefined') return Promise.resolve(null);

  iconImagePromise = new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      iconImage = image;
      resolve(image);
    };
    image.onerror = () => resolve(null);
    image.src = BRL_ICON_PATH;
  });
  return iconImagePromise;
}

/** Draw a currency string on an existing canvas while replacing R$ with the image. */
export function drawBRLCanvasText(context, text, x, y) {
  const value = String(text ?? '');
  const pattern = /R\$(\s*)/g;
  const fontSize = Number(context.font.match(/(?:^|\s)(\d+(?:\.\d+)?)px(?:\s|\/|$)/)?.[1]) || 16;
  let cursor = x;
  let last = 0;
  let match;

  while ((match = pattern.exec(value))) {
    const before = value.slice(last, match.index);
    if (before) {
      context.fillText(before, cursor, y);
      cursor += context.measureText(before).width;
    }

    const symbolWidth = context.measureText('R$').width;
    if (iconImage?.complete && iconImage.naturalWidth > 0) {
      const height = Math.min(fontSize * 0.74, (symbolWidth / 64) * 40);
      const width = (height / 40) * 64;
      const centerY = context.textBaseline === 'middle' ? y : y - fontSize * 0.34;
      context.drawImage(iconImage, cursor, centerY - height / 2, width, height);
      cursor += width;
    } else {
      context.fillText('R$', cursor, y);
      cursor += symbolWidth;
    }

    if (match[1]) {
      context.fillText(match[1], cursor, y);
      cursor += context.measureText(match[1]).width;
    }
    last = pattern.lastIndex;
  }

  const tail = value.slice(last);
  if (tail) context.fillText(tail, cursor, y);
}

/** An accessible image of the Brazilian real sign, sized to the surrounding text. */
export function BRLSymbol({ className, style, ...props }) {
  return (
    <img
      src={BRL_ICON_PATH}
      alt="R$"
      title="Real brasileiro"
      className={className}
      width="64"
      height="40"
      draggable="false"
      {...props}
      style={{
        display: 'inline-block',
        width: '1.1em',
        height: '0.69em',
        objectFit: 'contain',
        verticalAlign: '-0.04em',
        marginRight: 0,
        ...style,
      }}
    />
  );
}

function textWithBRLImage(text, keyPrefix) {
  const pattern = /R\$/g;
  const nodes = [];
  let last = 0;
  let match;
  let index = 0;

  while ((match = pattern.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    nodes.push(<BRLSymbol key={`${keyPrefix}-${index++}`} />);
    last = pattern.lastIndex;
  }

  if (last === 0) return text;
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function replaceBRL(children, keyPrefix = 'brl') {
  if (typeof children === 'string') return textWithBRLImage(children, keyPrefix);
  if (Array.isArray(children)) return children.map((child, index) => replaceBRL(child, `${keyPrefix}-${index}`));
  if (isValidElement(children) && children.props.children != null) {
    return cloneElement(children, undefined, replaceBRL(children.props.children, `${keyPrefix}-child`));
  }
  return children;
}

/** Replace visible R$ text in card copy while keeping the existing layout markup. */
export function BRLText({ children }) {
  return <>{replaceBRL(children)}</>;
}
