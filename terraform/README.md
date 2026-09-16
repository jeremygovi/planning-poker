# Déploiement AWS EC2

Cette configuration crée une instance Amazon Linux 2023 dans le VPC par défaut, un security group, un profil SSM et un volume racine gp3 chiffré. Docker exécute l’image publiée comme service `systemd`; aucun dépôt ni environnement Node.js n’est installé sur la VM.

```sh
cp terraform.tfvars.example terraform.tfvars
# Remplacer impérativement allowed_cidrs.
terraform init
terraform plan
terraform apply
```

Les sorties donnent l’URL, l’identifiant EC2 et la commande Session Manager. Les données SQLite résident dans `/opt/poker-express/data` sur le volume racine. Une modification du bootstrap ne remplace pas automatiquement l’instance afin de protéger ces données. Sauvegardez ce répertoire avant toute destruction ou reconstruction.

`t3.micro` peut être couvert par le Free Tier ou les crédits d’un compte éligible, mais AWS peut facturer notamment l’adresse IPv4 publique, le stockage et le trafic. Consultez toujours l’estimation du plan et la tarification de votre compte.
