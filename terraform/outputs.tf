output "instance_id" {
  description = "EC2 instance ID, usable with AWS Systems Manager Session Manager."
  value       = aws_instance.app.id
}

output "public_ip" {
  description = "Ephemeral public IPv4 address of the EC2 instance."
  value       = aws_instance.app.public_ip
}

output "application_url" {
  description = "Direct application URL. Prefer a TLS reverse proxy and access control for production."
  value       = "http://${aws_instance.app.public_ip}${var.app_port == 80 ? "" : ":${var.app_port}"}"
}

output "ssm_start_session_command" {
  description = "Command to open a shell without exposing SSH."
  value       = "aws ssm start-session --target ${aws_instance.app.id} --region ${var.aws_region}"
}
