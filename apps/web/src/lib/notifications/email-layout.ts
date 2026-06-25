/**
 * Branded HTML shell for transactional email. Admin `message_templates.email_body`
 * stays plain text; this module converts it to safe HTML and wraps it in the
 * Convene layout (logo header, hero-orange bars, footer).
 */

const HERO_ORANGE = "#F77F00";
const NAVY = "#003049";
const OUTER_BG = "#ECECEC";
const CARD_BG = "#FFFFFF";
const MUTED = "#6B7280";
const SUPPORT_EMAIL = "support@convene.io";
/** Display size for `public/email/convene_logo.png` (280×47 @2x → 140×24). */
export const EMAIL_LOGO_DISPLAY_WIDTH_PX = 140;
export const EMAIL_LOGO_DISPLAY_HEIGHT_PX = 24;
export const EMAIL_LOGO_FILENAME = "convene_logo.png";
const EMAIL_LOGO_CACHE_VERSION = "4";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function emailLogoUrl(): string | null {
  const override = process.env.CONVENE_EMAIL_LOGO_URL?.trim();
  if (override) return override;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (appUrl?.startsWith("http")) {
    return `${appUrl}/email/${EMAIL_LOGO_FILENAME}`;
  }
  return null;
}

function renderLogoCell(): string {
  const logoUrl = emailLogoUrl();
  if (logoUrl) {
    return renderEmailLogoImgHtml(logoUrl);
  }
  return renderEmailLogoTextHtml();
}

/** Hosted transparent PNG wordmark — use same URL in Supabase auth templates. */
export function renderEmailLogoImgHtml(logoUrl: string): string {
  const src = logoUrl.includes("?") ? logoUrl : `${logoUrl}?v=${EMAIL_LOGO_CACHE_VERSION}`;
  const w = EMAIL_LOGO_DISPLAY_WIDTH_PX;
  const h = EMAIL_LOGO_DISPLAY_HEIGHT_PX;
  return `<img src="${escapeHtml(src)}" alt="Convene" width="${w}" height="${h}" style="display:block;border:0;outline:none;text-decoration:none;width:${w}px;height:${h}px;max-width:${w}px;"/>`;
}

/** Orange wordmark — reliable in auth email templates where hosted images are often blocked. */
export function renderEmailLogoTextHtml(): string {
  return `<span style="font-family:'Acumin Pro','Acumin Pro ExtraCondensed',Arial,Helvetica,sans-serif;font-size:28px;font-weight:700;color:${HERO_ORANGE};letter-spacing:-0.5px;line-height:1;">convene</span>`;
}

/** Optional @font-face block when Acumin Pro is self-hosted (see public/fonts/). */
export function emailLogoFontFaceCss(baseUrl: string): string {
  const root = baseUrl.replace(/\/$/, "");
  return `@font-face{font-family:'Acumin Pro';font-style:normal;font-weight:700;font-display:swap;src:url('${root}/fonts/acumin-pro-bold.woff2') format('woff2'),url('${root}/fonts/acumin-pro-bold.woff') format('woff');}`;
}

/** Turn plain-text template body into safe inner HTML (paragraphs, bullets, links). */
export function plainTextToEmailHtml(text: string): string {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${NAVY};">&nbsp;</p>`;
  }

  const blocks = normalized.split(/\n\n+/);
  const parts: string[] = [];
  let isFirstBlock = true;

  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trimEnd()).filter((l) => l.length > 0);
    if (lines.length === 0) continue;

    const isBulletBlock = lines.every((line) => /^([•\-*]|\d+\.)\s+/.test(line));
    if (isBulletBlock) {
      const items = lines
        .map((line) => {
          const content = line.replace(/^([•\-*]|\d+\.)\s+/, "");
          return `<li style="margin:0 0 8px;font-size:15px;line-height:1.55;color:${NAVY};">${renderInlineEmailText(content)}</li>`;
        })
        .join("");
      parts.push(
        `<ul style="margin:0 0 20px 20px;padding:0;list-style-type:disc;">${items}</ul>`,
      );
      isFirstBlock = false;
      continue;
    }

    const joined = lines.map((line) => renderInlineEmailText(line)).join("<br/>");
    if (isFirstBlock && lines.length === 1 && lines[0].length <= 90) {
      parts.push(
        `<p style="margin:0 0 20px;font-size:22px;font-weight:700;line-height:1.35;color:${NAVY};">${joined}</p>`,
      );
    } else {
      parts.push(
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${NAVY};">${joined}</p>`,
      );
    }
    isFirstBlock = false;
  }

  return parts.join("");
}

function linkify(s: string): string {
  return s.replace(
    /(https?:\/\/[^\s<]+)/g,
    `<a href="$1" style="color:${HERO_ORANGE};text-decoration:underline;">$1</a>`,
  );
}

/** Supports bare URLs and markdown links `[label](https://…)` in plain-text email bodies. */
function renderInlineEmailText(raw: string): string {
  const mdLinkRe = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g;
  let result = "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = mdLinkRe.exec(raw)) !== null) {
    result += linkify(escapeHtml(raw.slice(lastIndex, match.index)));
    result += `<a href="${escapeHtml(match[2])}" style="color:${HERO_ORANGE};text-decoration:underline;">${escapeHtml(match[1])}</a>`;
    lastIndex = match.index + match[0].length;
  }
  result += linkify(escapeHtml(raw.slice(lastIndex)));
  return result;
}

export type TransactionalEmailLayoutOptions = {
  /** Plain-text body (variables already resolved). */
  bodyText: string;
  /** Optional primary CTA below the body copy. */
  ctaUrl?: string | null;
  ctaLabel?: string | null;
  /** Hidden inbox preview line. Defaults to first line of body. */
  preheader?: string | null;
};

export function wrapTransactionalEmailHtml(options: TransactionalEmailLayoutOptions): string {
  const { bodyText, ctaUrl, ctaLabel, preheader } = options;
  const contentHtml = plainTextToEmailHtml(bodyText);
  const logoCell = renderLogoCell();
  const helpUrl = `mailto:${SUPPORT_EMAIL}`;
  const year = new Date().getFullYear();
  const preview = escapeHtml((preheader ?? bodyText.split("\n")[0] ?? "").trim()).slice(0, 140);

  const ctaBlock =
    ctaUrl && ctaLabel
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:8px 0 24px;">
  <tr>
    <td align="center">
      <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:${NAVY};color:#FFFFFF;font-size:15px;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:4px;">${escapeHtml(ctaLabel)}</a>
    </td>
  </tr>
</table>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta name="color-scheme" content="light"/>
  <meta name="supported-color-schemes" content="light"/>
  <title>Convene</title>
</head>
<body style="margin:0;padding:0;background:${OUTER_BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preview}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${OUTER_BG};">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;">
          <tr>
            <td style="padding:0 8px 16px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="left" valign="middle">
                    ${logoCell}
                  </td>
                  <td align="right" valign="middle" style="font-size:13px;line-height:1.4;color:${MUTED};">
                    <a href="${helpUrl}" style="color:${NAVY};text-decoration:underline;">Need help? Contact us.</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background:${HERO_ORANGE};height:6px;font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="background:${CARD_BG};padding:32px 28px 28px;">
              ${contentHtml}
              ${ctaBlock}
            </td>
          </tr>
          <tr>
            <td style="background:${HERO_ORANGE};height:6px;font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td align="center" style="padding:20px 12px 8px;font-size:12px;line-height:1.5;color:${MUTED};">
              Please do not reply to this email. Emails sent to this address will not be answered.
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:0 12px 24px;font-size:12px;line-height:1.5;color:${MUTED};">
              Copyright &copy; ${year} Convene. All rights reserved.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Build html + plain text for SendGrid from a resolved template body. */
export function buildTransactionalEmailPayload(
  bodyText: string,
  layout?: Pick<TransactionalEmailLayoutOptions, "ctaUrl" | "ctaLabel" | "preheader">,
): { text: string; html: string } {
  const text = bodyText.trim();
  const html = wrapTransactionalEmailHtml({
    bodyText: text,
    ctaUrl: layout?.ctaUrl,
    ctaLabel: layout?.ctaLabel,
    preheader: layout?.preheader,
  });
  return { text, html };
}
