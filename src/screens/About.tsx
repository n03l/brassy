import { t } from '../i18n';
import { COMMIT, REPO_URL, SHORT_COMMIT, SOURCE_URL } from '../app/version';
const BASE = import.meta.env.BASE_URL;

export function About() {
  return (
    <section className="card plain-page">
      <h1>{t('about.title')}</h1>
      <p>
        {t('about.licence1')} <a href={`${BASE}LICENSE.txt`}>{t('about.licenceLink')}</a> {t('about.licence2')}
      </p>
      <h2>{t('about.source')}</h2>
      <ul>
        <li><a href={REPO_URL} rel="noopener noreferrer">{t('about.github')}</a></li>
        {COMMIT && <li>{t('about.version')} <a href={SOURCE_URL} rel="noopener noreferrer"><code>{SHORT_COMMIT}</code></a></li>}
      </ul>
      <h2>{t('about.thanks')}</h2>
      <p>
        {t('about.credits')} <a href={`${BASE}THIRD-PARTY-NOTICES.txt`}>{t('about.notices')}</a>.{' '}
        <a href="https://alphatab.net" rel="noopener noreferrer">alphaTab.net</a>
      </p>
    </section>
  );
}
