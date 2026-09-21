import { SERVICE_SETUP, serviceReadiness, type RuntimeServiceStatus } from '@/lib/service-readiness';
import styles from './ServiceReadiness.module.css';

export default function ServiceReadiness({ providers, attachments }: { providers: RuntimeServiceStatus[]; attachments?: { storage?: { configured?: boolean }; scanner?: { configured?: boolean } } }) {
  return <section className={styles.section} aria-label="Connection checklist" data-testid="service-readiness">
    <h2>Connect the services your team needs</h2>
    <p>Start with the service your next task uses. A saved connection needs a successful test before you rely on it.</p>
    <div className={styles.grid}>{SERVICE_SETUP.map(service => {
      const status = serviceReadiness(providers.find(item => item.kind === service.kind));
      return <article key={service.kind} data-service={service.kind}>
        <h3>{service.title}</h3>
        <span className={styles.status} data-state={status.tone}>{status.label}</span>
        <p>{service.purpose}</p>
        <strong>{status.action === 'check' ? 'Check that it works' : 'Next step'}</strong>
        <p>{status.action === 'check' ? service.check : service.next}</p>
        {service.kind === 'sms' && <a href="https://callcommand-ai.operatoros.net/setup">Set up phone answering →</a>}
      </article>;
    })}
      <article data-service="files">
        <h3>File safety checks</h3>
        <span className={styles.status}>{attachments?.storage?.configured && attachments?.scanner?.configured ? 'Configured · test still needed' : 'Setup needed'}</span>
        <p>Protects uploads and downloads used for reports and evidence.</p>
        <strong>Next step</strong>
        <p>{attachments?.storage?.configured && attachments?.scanner?.configured ? 'Upload an approved sample file and confirm it passes its safety check before downloading it.' : 'Ask your platform administrator to connect file storage and the private ClamAV scanning service. Files stay blocked until their safety check passes.'}</p>
      </article>
    </div>
  </section>;
}
