import {
  Container,
  Database,
  Globe,
  Mail,
  type LucideIcon,
} from "lucide-react";
import type { SimpleIcon } from "simple-icons";
import {
  siAlpinelinux,
  siApache,
  siApachekafka,
  siCaddy,
  siClickhouse,
  siDebian,
  siDocker,
  siEclipsemosquitto,
  siElasticsearch,
  siGitea,
  siGitlab,
  siGo,
  siGrafana,
  siHomeassistant,
  siInfluxdb,
  siJenkins,
  siKeycloak,
  siKibana,
  siMariadb,
  siMinio,
  siMongodb,
  siMysql,
  siNatsdotio,
  siNextcloud,
  siNginx,
  siNodedotjs,
  siPhp,
  siPortainer,
  siPostgresql,
  siPrometheus,
  siPython,
  siRabbitmq,
  siRedis,
  siSonarqubeserver,
  siTraefikproxy,
  siUbuntu,
  siVault,
  siWordpress,
} from "simple-icons";

import { cn } from "@/lib/utils";

interface ServiceDef {
  /** subcadenas buscadas en la referencia de imagen, en orden */
  match: string[];
  icon?: SimpleIcon;
  lucide?: LucideIcon;
  label: string;
}

/** los más específicos primero: "pgadmin" antes que "postgres", etc. */
const SERVICES: ServiceDef[] = [
  { match: ["pgadmin"], lucide: Database, label: "pgAdmin" },
  { match: ["adminer"], lucide: Database, label: "Adminer" },
  { match: ["postgres", "timescale", "pgvector"], icon: siPostgresql, label: "PostgreSQL" },
  { match: ["mariadb"], icon: siMariadb, label: "MariaDB" },
  { match: ["mysql", "percona"], icon: siMysql, label: "MySQL" },
  { match: ["mongo-express"], icon: siMongodb, label: "Mongo Express" },
  { match: ["mongo"], icon: siMongodb, label: "MongoDB" },
  { match: ["redis-commander", "redisinsight"], icon: siRedis, label: "Redis UI" },
  { match: ["redis", "valkey"], icon: siRedis, label: "Redis" },
  { match: ["clickhouse"], icon: siClickhouse, label: "ClickHouse" },
  { match: ["influxdb"], icon: siInfluxdb, label: "InfluxDB" },
  { match: ["elasticsearch", "opensearch"], icon: siElasticsearch, label: "Elasticsearch" },
  { match: ["kibana"], icon: siKibana, label: "Kibana" },
  { match: ["kafka"], icon: siApachekafka, label: "Kafka" },
  { match: ["nats"], icon: siNatsdotio, label: "NATS" },
  { match: ["rabbitmq"], icon: siRabbitmq, label: "RabbitMQ" },
  { match: ["mosquitto", "mqtt"], icon: siEclipsemosquitto, label: "Mosquitto" },
  { match: ["nginx"], icon: siNginx, label: "Nginx" },
  { match: ["traefik"], icon: siTraefikproxy, label: "Traefik" },
  { match: ["caddy"], icon: siCaddy, label: "Caddy" },
  { match: ["httpd", "apache"], icon: siApache, label: "Apache" },
  { match: ["node"], icon: siNodedotjs, label: "Node.js" },
  { match: ["php"], icon: siPhp, label: "PHP" },
  { match: ["python"], icon: siPython, label: "Python" },
  { match: ["golang"], icon: siGo, label: "Go" },
  { match: ["wordpress"], icon: siWordpress, label: "WordPress" },
  { match: ["grafana"], icon: siGrafana, label: "Grafana" },
  { match: ["prometheus"], icon: siPrometheus, label: "Prometheus" },
  { match: ["minio"], icon: siMinio, label: "MinIO" },
  { match: ["keycloak"], icon: siKeycloak, label: "Keycloak" },
  { match: ["vault"], icon: siVault, label: "Vault" },
  { match: ["portainer"], icon: siPortainer, label: "Portainer" },
  { match: ["gitlab"], icon: siGitlab, label: "GitLab" },
  { match: ["gitea"], icon: siGitea, label: "Gitea" },
  { match: ["jenkins"], icon: siJenkins, label: "Jenkins" },
  { match: ["sonarqube"], icon: siSonarqubeserver, label: "SonarQube" },
  { match: ["nextcloud"], icon: siNextcloud, label: "Nextcloud" },
  { match: ["home-assistant", "homeassistant"], icon: siHomeassistant, label: "Home Assistant" },
  { match: ["mailhog", "maildev", "mailpit"], lucide: Mail, label: "Mail dev" },
  { match: ["registry"], icon: siDocker, label: "Registry" },
  { match: ["alpine"], icon: siAlpinelinux, label: "Alpine" },
  { match: ["ubuntu"], icon: siUbuntu, label: "Ubuntu" },
  { match: ["debian"], icon: siDebian, label: "Debian" },
  { match: ["whoami", "echo"], lucide: Globe, label: "HTTP" },
];

export function detectService(image: string): ServiceDef | null {
  const ref = image.toLowerCase();
  return SERVICES.find((s) => s.match.some((m) => ref.includes(m))) ?? null;
}

/** marcas casi negras (Kafka, etc.) serían invisibles en tema oscuro */
function legibleColor(hex: string): string | null {
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.25 ? null : `#${hex}`;
}

export function ServiceGlyph({
  image,
  className,
}: {
  image: string;
  className?: string;
}) {
  const service = detectService(image);

  if (service?.icon) {
    const color = legibleColor(service.icon.hex);
    return (
      <svg
        viewBox="0 0 24 24"
        role="img"
        aria-label={service.label}
        className={cn(className, !color && "fill-foreground/80")}
      >
        <path d={service.icon.path} fill={color ?? undefined} />
      </svg>
    );
  }

  const Fallback = service?.lucide ?? Container;
  return <Fallback className={cn(className, "text-muted-foreground")} />;
}
