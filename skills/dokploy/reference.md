# Dokploy CLI — Domain Reference

Auto-generated from `endpoints-parsed.json`. Do not edit by hand; run `npm run generate-skill-reference`.

48 domains, 524 actions total.

Run `dokploy <domain> <action> --help` for parameter details on any specific action.

## admin (1)

- `dokploy admin setupMonitoring` — POST /admin.setupMonitoring

## ai (12)

- `dokploy ai analyzeLogs` — POST /ai.analyzeLogs
- `dokploy ai create` — POST /ai.create
- `dokploy ai delete` — POST /ai.delete
- `dokploy ai deploy` — POST /ai.deploy
- `dokploy ai get` — GET /ai.get
- `dokploy ai getAll` — GET /ai.getAll
- `dokploy ai getEnabledProviders` — GET /ai.getEnabledProviders
- `dokploy ai getModels` — GET /ai.getModels
- `dokploy ai one` — GET /ai.one
- `dokploy ai suggest` — POST /ai.suggest
- `dokploy ai testConnection` — POST /ai.testConnection
- `dokploy ai update` — POST /ai.update

## application (31)

- `dokploy application cancelDeployment` — POST /application.cancelDeployment
- `dokploy application cleanQueues` — POST /application.cleanQueues
- `dokploy application clearDeployments` — POST /application.clearDeployments
- `dokploy application create` — POST /application.create
- `dokploy application delete` — POST /application.delete
- `dokploy application deploy` — POST /application.deploy
- `dokploy application disconnectGitProvider` — POST /application.disconnectGitProvider
- `dokploy application dropDeployment` — POST /application.dropDeployment
- `dokploy application killBuild` — POST /application.killBuild
- `dokploy application markRunning` — POST /application.markRunning
- `dokploy application move` — POST /application.move
- `dokploy application one` — GET /application.one
- `dokploy application readAppMonitoring` — GET /application.readAppMonitoring
- `dokploy application readLogs` — GET /application.readLogs
- `dokploy application readTraefikConfig` — GET /application.readTraefikConfig
- `dokploy application redeploy` — POST /application.redeploy
- `dokploy application refreshToken` — POST /application.refreshToken
- `dokploy application reload` — POST /application.reload
- `dokploy application saveBitbucketProvider` — POST /application.saveBitbucketProvider
- `dokploy application saveBuildType` — POST /application.saveBuildType
- `dokploy application saveDockerProvider` — POST /application.saveDockerProvider
- `dokploy application saveEnvironment` — POST /application.saveEnvironment
- `dokploy application saveGiteaProvider` — POST /application.saveGiteaProvider
- `dokploy application saveGithubProvider` — POST /application.saveGithubProvider
- `dokploy application saveGitlabProvider` — POST /application.saveGitlabProvider
- `dokploy application saveGitProvider` — POST /application.saveGitProvider
- `dokploy application search` — GET /application.search
- `dokploy application start` — POST /application.start
- `dokploy application stop` — POST /application.stop
- `dokploy application update` — POST /application.update
- `dokploy application updateTraefikConfig` — POST /application.updateTraefikConfig

## auditLog (1)

- `dokploy auditLog all` — GET /auditLog.all

## backup (12)

- `dokploy backup create` — POST /backup.create
- `dokploy backup listBackupFiles` — GET /backup.listBackupFiles
- `dokploy backup manualBackupCompose` — POST /backup.manualBackupCompose
- `dokploy backup manualBackupLibsql` — POST /backup.manualBackupLibsql
- `dokploy backup manualBackupMariadb` — POST /backup.manualBackupMariadb
- `dokploy backup manualBackupMongo` — POST /backup.manualBackupMongo
- `dokploy backup manualBackupMySql` — POST /backup.manualBackupMySql
- `dokploy backup manualBackupPostgres` — POST /backup.manualBackupPostgres
- `dokploy backup manualBackupWebServer` — POST /backup.manualBackupWebServer
- `dokploy backup one` — GET /backup.one
- `dokploy backup remove` — POST /backup.remove
- `dokploy backup update` — POST /backup.update

## bitbucket (7)

- `dokploy bitbucket bitbucketProviders` — GET /bitbucket.bitbucketProviders
- `dokploy bitbucket create` — POST /bitbucket.create
- `dokploy bitbucket getBitbucketBranches` — GET /bitbucket.getBitbucketBranches
- `dokploy bitbucket getBitbucketRepositories` — GET /bitbucket.getBitbucketRepositories
- `dokploy bitbucket one` — GET /bitbucket.one
- `dokploy bitbucket testConnection` — POST /bitbucket.testConnection
- `dokploy bitbucket update` — POST /bitbucket.update

## certificates (5)

- `dokploy certificates all` — GET /certificates.all
- `dokploy certificates create` — POST /certificates.create
- `dokploy certificates one` — GET /certificates.one
- `dokploy certificates remove` — POST /certificates.remove
- `dokploy certificates update` — POST /certificates.update

## cluster (4)

- `dokploy cluster addManager` — GET /cluster.addManager
- `dokploy cluster addWorker` — GET /cluster.addWorker
- `dokploy cluster getNodes` — GET /cluster.getNodes
- `dokploy cluster removeWorker` — POST /cluster.removeWorker

## compose (30)

- `dokploy compose cancelDeployment` — POST /compose.cancelDeployment
- `dokploy compose cleanQueues` — POST /compose.cleanQueues
- `dokploy compose clearDeployments` — POST /compose.clearDeployments
- `dokploy compose create` — POST /compose.create
- `dokploy compose delete` — POST /compose.delete
- `dokploy compose deploy` — POST /compose.deploy
- `dokploy compose deployTemplate` — POST /compose.deployTemplate
- `dokploy compose disconnectGitProvider` — POST /compose.disconnectGitProvider
- `dokploy compose fetchSourceType` — POST /compose.fetchSourceType
- `dokploy compose getConvertedCompose` — GET /compose.getConvertedCompose
- `dokploy compose getDefaultCommand` — GET /compose.getDefaultCommand
- `dokploy compose getTags` — GET /compose.getTags
- `dokploy compose import` — POST /compose.import
- `dokploy compose isolatedDeployment` — POST /compose.isolatedDeployment
- `dokploy compose killBuild` — POST /compose.killBuild
- `dokploy compose loadMountsByService` — GET /compose.loadMountsByService
- `dokploy compose loadServices` — GET /compose.loadServices
- `dokploy compose move` — POST /compose.move
- `dokploy compose one` — GET /compose.one
- `dokploy compose processTemplate` — POST /compose.processTemplate
- `dokploy compose randomizeCompose` — POST /compose.randomizeCompose
- `dokploy compose readLogs` — GET /compose.readLogs
- `dokploy compose redeploy` — POST /compose.redeploy
- `dokploy compose refreshToken` — POST /compose.refreshToken
- `dokploy compose saveEnvironment` — POST /compose.saveEnvironment
- `dokploy compose search` — GET /compose.search
- `dokploy compose start` — POST /compose.start
- `dokploy compose stop` — POST /compose.stop
- `dokploy compose templates` — GET /compose.templates
- `dokploy compose update` — POST /compose.update

## customRole (6)

- `dokploy customRole all` — GET /customRole.all
- `dokploy customRole create` — POST /customRole.create
- `dokploy customRole getStatements` — GET /customRole.getStatements
- `dokploy customRole membersByRole` — GET /customRole.membersByRole
- `dokploy customRole remove` — POST /customRole.remove
- `dokploy customRole update` — POST /customRole.update

## deployment (8)

- `dokploy deployment all` — GET /deployment.all
- `dokploy deployment allByCompose` — GET /deployment.allByCompose
- `dokploy deployment allByServer` — GET /deployment.allByServer
- `dokploy deployment allByType` — GET /deployment.allByType
- `dokploy deployment allCentralized` — GET /deployment.allCentralized
- `dokploy deployment killProcess` — POST /deployment.killProcess
- `dokploy deployment queueList` — GET /deployment.queueList
- `dokploy deployment removeDeployment` — POST /deployment.removeDeployment

## destination (6)

- `dokploy destination all` — GET /destination.all
- `dokploy destination create` — POST /destination.create
- `dokploy destination one` — GET /destination.one
- `dokploy destination remove` — POST /destination.remove
- `dokploy destination testConnection` — POST /destination.testConnection
- `dokploy destination update` — POST /destination.update

## docker (12)

- `dokploy docker getConfig` — GET /docker.getConfig
- `dokploy docker getContainers` — GET /docker.getContainers
- `dokploy docker getContainersByAppLabel` — GET /docker.getContainersByAppLabel
- `dokploy docker getContainersByAppNameMatch` — GET /docker.getContainersByAppNameMatch
- `dokploy docker getServiceContainersByAppName` — GET /docker.getServiceContainersByAppName
- `dokploy docker getStackContainersByAppName` — GET /docker.getStackContainersByAppName
- `dokploy docker killContainer` — POST /docker.killContainer
- `dokploy docker removeContainer` — POST /docker.removeContainer
- `dokploy docker restartContainer` — POST /docker.restartContainer
- `dokploy docker startContainer` — POST /docker.startContainer
- `dokploy docker stopContainer` — POST /docker.stopContainer
- `dokploy docker uploadFileToContainer` — POST /docker.uploadFileToContainer

## domain (9)

- `dokploy domain byApplicationId` — GET /domain.byApplicationId
- `dokploy domain byComposeId` — GET /domain.byComposeId
- `dokploy domain canGenerateTraefikMeDomains` — GET /domain.canGenerateTraefikMeDomains
- `dokploy domain create` — POST /domain.create
- `dokploy domain delete` — POST /domain.delete
- `dokploy domain generateDomain` — POST /domain.generateDomain
- `dokploy domain one` — GET /domain.one
- `dokploy domain update` — POST /domain.update
- `dokploy domain validateDomain` — POST /domain.validateDomain

## environment (7)

- `dokploy environment byProjectId` — GET /environment.byProjectId
- `dokploy environment create` — POST /environment.create
- `dokploy environment duplicate` — POST /environment.duplicate
- `dokploy environment one` — GET /environment.one
- `dokploy environment remove` — POST /environment.remove
- `dokploy environment search` — GET /environment.search
- `dokploy environment update` — POST /environment.update

## gitProvider (4)

- `dokploy gitProvider allForPermissions` — GET /gitProvider.allForPermissions
- `dokploy gitProvider getAll` — GET /gitProvider.getAll
- `dokploy gitProvider remove` — POST /gitProvider.remove
- `dokploy gitProvider toggleShare` — POST /gitProvider.toggleShare

## gitea (8)

- `dokploy gitea create` — POST /gitea.create
- `dokploy gitea getGiteaBranches` — GET /gitea.getGiteaBranches
- `dokploy gitea getGiteaRepositories` — GET /gitea.getGiteaRepositories
- `dokploy gitea getGiteaUrl` — GET /gitea.getGiteaUrl
- `dokploy gitea giteaProviders` — GET /gitea.giteaProviders
- `dokploy gitea one` — GET /gitea.one
- `dokploy gitea testConnection` — POST /gitea.testConnection
- `dokploy gitea update` — POST /gitea.update

## github (6)

- `dokploy github getGithubBranches` — GET /github.getGithubBranches
- `dokploy github getGithubRepositories` — GET /github.getGithubRepositories
- `dokploy github githubProviders` — GET /github.githubProviders
- `dokploy github one` — GET /github.one
- `dokploy github testConnection` — POST /github.testConnection
- `dokploy github update` — POST /github.update

## gitlab (7)

- `dokploy gitlab create` — POST /gitlab.create
- `dokploy gitlab getGitlabBranches` — GET /gitlab.getGitlabBranches
- `dokploy gitlab getGitlabRepositories` — GET /gitlab.getGitlabRepositories
- `dokploy gitlab gitlabProviders` — GET /gitlab.gitlabProviders
- `dokploy gitlab one` — GET /gitlab.one
- `dokploy gitlab testConnection` — POST /gitlab.testConnection
- `dokploy gitlab update` — POST /gitlab.update

## libsql (14)

- `dokploy libsql changeStatus` — POST /libsql.changeStatus
- `dokploy libsql create` — POST /libsql.create
- `dokploy libsql deploy` — POST /libsql.deploy
- `dokploy libsql move` — POST /libsql.move
- `dokploy libsql one` — GET /libsql.one
- `dokploy libsql readLogs` — GET /libsql.readLogs
- `dokploy libsql rebuild` — POST /libsql.rebuild
- `dokploy libsql reload` — POST /libsql.reload
- `dokploy libsql remove` — POST /libsql.remove
- `dokploy libsql saveEnvironment` — POST /libsql.saveEnvironment
- `dokploy libsql saveExternalPorts` — POST /libsql.saveExternalPorts
- `dokploy libsql start` — POST /libsql.start
- `dokploy libsql stop` — POST /libsql.stop
- `dokploy libsql update` — POST /libsql.update

## licenseKey (6)

- `dokploy licenseKey activate` — POST /licenseKey.activate
- `dokploy licenseKey deactivate` — POST /licenseKey.deactivate
- `dokploy licenseKey getEnterpriseSettings` — GET /licenseKey.getEnterpriseSettings
- `dokploy licenseKey haveValidLicenseKey` — GET /licenseKey.haveValidLicenseKey
- `dokploy licenseKey updateEnterpriseSettings` — POST /licenseKey.updateEnterpriseSettings
- `dokploy licenseKey validate` — POST /licenseKey.validate

## mariadb (16)

- `dokploy mariadb changePassword` — POST /mariadb.changePassword
- `dokploy mariadb changeStatus` — POST /mariadb.changeStatus
- `dokploy mariadb create` — POST /mariadb.create
- `dokploy mariadb deploy` — POST /mariadb.deploy
- `dokploy mariadb move` — POST /mariadb.move
- `dokploy mariadb one` — GET /mariadb.one
- `dokploy mariadb readLogs` — GET /mariadb.readLogs
- `dokploy mariadb rebuild` — POST /mariadb.rebuild
- `dokploy mariadb reload` — POST /mariadb.reload
- `dokploy mariadb remove` — POST /mariadb.remove
- `dokploy mariadb saveEnvironment` — POST /mariadb.saveEnvironment
- `dokploy mariadb saveExternalPort` — POST /mariadb.saveExternalPort
- `dokploy mariadb search` — GET /mariadb.search
- `dokploy mariadb start` — POST /mariadb.start
- `dokploy mariadb stop` — POST /mariadb.stop
- `dokploy mariadb update` — POST /mariadb.update

## mongo (16)

- `dokploy mongo changePassword` — POST /mongo.changePassword
- `dokploy mongo changeStatus` — POST /mongo.changeStatus
- `dokploy mongo create` — POST /mongo.create
- `dokploy mongo deploy` — POST /mongo.deploy
- `dokploy mongo move` — POST /mongo.move
- `dokploy mongo one` — GET /mongo.one
- `dokploy mongo readLogs` — GET /mongo.readLogs
- `dokploy mongo rebuild` — POST /mongo.rebuild
- `dokploy mongo reload` — POST /mongo.reload
- `dokploy mongo remove` — POST /mongo.remove
- `dokploy mongo saveEnvironment` — POST /mongo.saveEnvironment
- `dokploy mongo saveExternalPort` — POST /mongo.saveExternalPort
- `dokploy mongo search` — GET /mongo.search
- `dokploy mongo start` — POST /mongo.start
- `dokploy mongo stop` — POST /mongo.stop
- `dokploy mongo update` — POST /mongo.update

## mounts (6)

- `dokploy mounts allNamedByApplicationId` — GET /mounts.allNamedByApplicationId
- `dokploy mounts create` — POST /mounts.create
- `dokploy mounts listByServiceId` — GET /mounts.listByServiceId
- `dokploy mounts one` — GET /mounts.one
- `dokploy mounts remove` — POST /mounts.remove
- `dokploy mounts update` — POST /mounts.update

## mysql (16)

- `dokploy mysql changePassword` — POST /mysql.changePassword
- `dokploy mysql changeStatus` — POST /mysql.changeStatus
- `dokploy mysql create` — POST /mysql.create
- `dokploy mysql deploy` — POST /mysql.deploy
- `dokploy mysql move` — POST /mysql.move
- `dokploy mysql one` — GET /mysql.one
- `dokploy mysql readLogs` — GET /mysql.readLogs
- `dokploy mysql rebuild` — POST /mysql.rebuild
- `dokploy mysql reload` — POST /mysql.reload
- `dokploy mysql remove` — POST /mysql.remove
- `dokploy mysql saveEnvironment` — POST /mysql.saveEnvironment
- `dokploy mysql saveExternalPort` — POST /mysql.saveExternalPort
- `dokploy mysql search` — GET /mysql.search
- `dokploy mysql start` — POST /mysql.start
- `dokploy mysql stop` — POST /mysql.stop
- `dokploy mysql update` — POST /mysql.update

## notification (41)

- `dokploy notification all` — GET /notification.all
- `dokploy notification createCustom` — POST /notification.createCustom
- `dokploy notification createDiscord` — POST /notification.createDiscord
- `dokploy notification createEmail` — POST /notification.createEmail
- `dokploy notification createGotify` — POST /notification.createGotify
- `dokploy notification createLark` — POST /notification.createLark
- `dokploy notification createMattermost` — POST /notification.createMattermost
- `dokploy notification createNtfy` — POST /notification.createNtfy
- `dokploy notification createPushover` — POST /notification.createPushover
- `dokploy notification createResend` — POST /notification.createResend
- `dokploy notification createSlack` — POST /notification.createSlack
- `dokploy notification createTeams` — POST /notification.createTeams
- `dokploy notification createTelegram` — POST /notification.createTelegram
- `dokploy notification getEmailProviders` — GET /notification.getEmailProviders
- `dokploy notification one` — GET /notification.one
- `dokploy notification receiveNotification` — POST /notification.receiveNotification
- `dokploy notification remove` — POST /notification.remove
- `dokploy notification testCustomConnection` — POST /notification.testCustomConnection
- `dokploy notification testDiscordConnection` — POST /notification.testDiscordConnection
- `dokploy notification testEmailConnection` — POST /notification.testEmailConnection
- `dokploy notification testGotifyConnection` — POST /notification.testGotifyConnection
- `dokploy notification testLarkConnection` — POST /notification.testLarkConnection
- `dokploy notification testMattermostConnection` — POST /notification.testMattermostConnection
- `dokploy notification testNtfyConnection` — POST /notification.testNtfyConnection
- `dokploy notification testPushoverConnection` — POST /notification.testPushoverConnection
- `dokploy notification testResendConnection` — POST /notification.testResendConnection
- `dokploy notification testSlackConnection` — POST /notification.testSlackConnection
- `dokploy notification testTeamsConnection` — POST /notification.testTeamsConnection
- `dokploy notification testTelegramConnection` — POST /notification.testTelegramConnection
- `dokploy notification updateCustom` — POST /notification.updateCustom
- `dokploy notification updateDiscord` — POST /notification.updateDiscord
- `dokploy notification updateEmail` — POST /notification.updateEmail
- `dokploy notification updateGotify` — POST /notification.updateGotify
- `dokploy notification updateLark` — POST /notification.updateLark
- `dokploy notification updateMattermost` — POST /notification.updateMattermost
- `dokploy notification updateNtfy` — POST /notification.updateNtfy
- `dokploy notification updatePushover` — POST /notification.updatePushover
- `dokploy notification updateResend` — POST /notification.updateResend
- `dokploy notification updateSlack` — POST /notification.updateSlack
- `dokploy notification updateTeams` — POST /notification.updateTeams
- `dokploy notification updateTelegram` — POST /notification.updateTelegram

## organization (11)

- `dokploy organization active` — GET /organization.active
- `dokploy organization all` — GET /organization.all
- `dokploy organization allInvitations` — GET /organization.allInvitations
- `dokploy organization create` — POST /organization.create
- `dokploy organization delete` — POST /organization.delete
- `dokploy organization inviteMember` — POST /organization.inviteMember
- `dokploy organization one` — GET /organization.one
- `dokploy organization removeInvitation` — POST /organization.removeInvitation
- `dokploy organization setDefault` — POST /organization.setDefault
- `dokploy organization update` — POST /organization.update
- `dokploy organization updateMemberRole` — POST /organization.updateMemberRole

## patch (12)

- `dokploy patch byEntityId` — GET /patch.byEntityId
- `dokploy patch cleanPatchRepos` — POST /patch.cleanPatchRepos
- `dokploy patch create` — POST /patch.create
- `dokploy patch delete` — POST /patch.delete
- `dokploy patch ensureRepo` — POST /patch.ensureRepo
- `dokploy patch markFileForDeletion` — POST /patch.markFileForDeletion
- `dokploy patch one` — GET /patch.one
- `dokploy patch readRepoDirectories` — GET /patch.readRepoDirectories
- `dokploy patch readRepoFile` — GET /patch.readRepoFile
- `dokploy patch saveFileAsPatch` — POST /patch.saveFileAsPatch
- `dokploy patch toggleEnabled` — POST /patch.toggleEnabled
- `dokploy patch update` — POST /patch.update

## port (4)

- `dokploy port create` — POST /port.create
- `dokploy port delete` — POST /port.delete
- `dokploy port one` — GET /port.one
- `dokploy port update` — POST /port.update

## postgres (16)

- `dokploy postgres changePassword` — POST /postgres.changePassword
- `dokploy postgres changeStatus` — POST /postgres.changeStatus
- `dokploy postgres create` — POST /postgres.create
- `dokploy postgres deploy` — POST /postgres.deploy
- `dokploy postgres move` — POST /postgres.move
- `dokploy postgres one` — GET /postgres.one
- `dokploy postgres readLogs` — GET /postgres.readLogs
- `dokploy postgres rebuild` — POST /postgres.rebuild
- `dokploy postgres reload` — POST /postgres.reload
- `dokploy postgres remove` — POST /postgres.remove
- `dokploy postgres saveEnvironment` — POST /postgres.saveEnvironment
- `dokploy postgres saveExternalPort` — POST /postgres.saveExternalPort
- `dokploy postgres search` — GET /postgres.search
- `dokploy postgres start` — POST /postgres.start
- `dokploy postgres stop` — POST /postgres.stop
- `dokploy postgres update` — POST /postgres.update

## previewDeployment (4)

- `dokploy previewDeployment all` — GET /previewDeployment.all
- `dokploy previewDeployment delete` — POST /previewDeployment.delete
- `dokploy previewDeployment one` — GET /previewDeployment.one
- `dokploy previewDeployment redeploy` — POST /previewDeployment.redeploy

## project (9)

- `dokploy project all` — GET /project.all
- `dokploy project allForPermissions` — GET /project.allForPermissions
- `dokploy project create` — POST /project.create
- `dokploy project duplicate` — POST /project.duplicate
- `dokploy project homeStats` — GET /project.homeStats
- `dokploy project one` — GET /project.one
- `dokploy project remove` — POST /project.remove
- `dokploy project search` — GET /project.search
- `dokploy project update` — POST /project.update

## redirects (4)

- `dokploy redirects create` — POST /redirects.create
- `dokploy redirects delete` — POST /redirects.delete
- `dokploy redirects one` — GET /redirects.one
- `dokploy redirects update` — POST /redirects.update

## redis (16)

- `dokploy redis changePassword` — POST /redis.changePassword
- `dokploy redis changeStatus` — POST /redis.changeStatus
- `dokploy redis create` — POST /redis.create
- `dokploy redis deploy` — POST /redis.deploy
- `dokploy redis move` — POST /redis.move
- `dokploy redis one` — GET /redis.one
- `dokploy redis readLogs` — GET /redis.readLogs
- `dokploy redis rebuild` — POST /redis.rebuild
- `dokploy redis reload` — POST /redis.reload
- `dokploy redis remove` — POST /redis.remove
- `dokploy redis saveEnvironment` — POST /redis.saveEnvironment
- `dokploy redis saveExternalPort` — POST /redis.saveExternalPort
- `dokploy redis search` — GET /redis.search
- `dokploy redis start` — POST /redis.start
- `dokploy redis stop` — POST /redis.stop
- `dokploy redis update` — POST /redis.update

## registry (7)

- `dokploy registry all` — GET /registry.all
- `dokploy registry create` — POST /registry.create
- `dokploy registry one` — GET /registry.one
- `dokploy registry remove` — POST /registry.remove
- `dokploy registry testRegistry` — POST /registry.testRegistry
- `dokploy registry testRegistryById` — POST /registry.testRegistryById
- `dokploy registry update` — POST /registry.update

## rollback (2)

- `dokploy rollback delete` — POST /rollback.delete
- `dokploy rollback rollback` — POST /rollback.rollback

## schedule (6)

- `dokploy schedule create` — POST /schedule.create
- `dokploy schedule delete` — POST /schedule.delete
- `dokploy schedule list` — GET /schedule.list
- `dokploy schedule one` — GET /schedule.one
- `dokploy schedule runManually` — POST /schedule.runManually
- `dokploy schedule update` — POST /schedule.update

## security (4)

- `dokploy security create` — POST /security.create
- `dokploy security delete` — POST /security.delete
- `dokploy security one` — GET /security.one
- `dokploy security update` — POST /security.update

## server (17)

- `dokploy server all` — GET /server.all
- `dokploy server allForPermissions` — GET /server.allForPermissions
- `dokploy server buildServers` — GET /server.buildServers
- `dokploy server count` — GET /server.count
- `dokploy server create` — POST /server.create
- `dokploy server getDefaultCommand` — GET /server.getDefaultCommand
- `dokploy server getServerMetrics` — GET /server.getServerMetrics
- `dokploy server getServerTime` — GET /server.getServerTime
- `dokploy server one` — GET /server.one
- `dokploy server publicIp` — GET /server.publicIp
- `dokploy server remove` — POST /server.remove
- `dokploy server security` — GET /server.security
- `dokploy server setup` — POST /server.setup
- `dokploy server setupMonitoring` — POST /server.setupMonitoring
- `dokploy server update` — POST /server.update
- `dokploy server validate` — GET /server.validate
- `dokploy server withSSHKey` — GET /server.withSSHKey

## settings (51)

- `dokploy settings assignDomainServer` — POST /settings.assignDomainServer
- `dokploy settings checkGPUStatus` — GET /settings.checkGPUStatus
- `dokploy settings checkInfrastructureHealth` — GET /settings.checkInfrastructureHealth
- `dokploy settings cleanAll` — POST /settings.cleanAll
- `dokploy settings cleanAllDeploymentQueue` — POST /settings.cleanAllDeploymentQueue
- `dokploy settings cleanDockerBuilder` — POST /settings.cleanDockerBuilder
- `dokploy settings cleanDockerPrune` — POST /settings.cleanDockerPrune
- `dokploy settings cleanMonitoring` — POST /settings.cleanMonitoring
- `dokploy settings cleanRedis` — POST /settings.cleanRedis
- `dokploy settings cleanSSHPrivateKey` — POST /settings.cleanSSHPrivateKey
- `dokploy settings cleanStoppedContainers` — POST /settings.cleanStoppedContainers
- `dokploy settings cleanUnusedImages` — POST /settings.cleanUnusedImages
- `dokploy settings cleanUnusedVolumes` — POST /settings.cleanUnusedVolumes
- `dokploy settings getDockerDiskUsage` — GET /settings.getDockerDiskUsage
- `dokploy settings getDokployCloudIps` — GET /settings.getDokployCloudIps
- `dokploy settings getDokployVersion` — GET /settings.getDokployVersion
- `dokploy settings getIp` — GET /settings.getIp
- `dokploy settings getLogCleanupStatus` — GET /settings.getLogCleanupStatus
- `dokploy settings getOpenApiDocument` — GET /settings.getOpenApiDocument
- `dokploy settings getReleaseTag` — GET /settings.getReleaseTag
- `dokploy settings getTraefikPorts` — GET /settings.getTraefikPorts
- `dokploy settings getUpdateData` — POST /settings.getUpdateData
- `dokploy settings getWebServerSettings` — GET /settings.getWebServerSettings
- `dokploy settings haveActivateRequests` — GET /settings.haveActivateRequests
- `dokploy settings haveTraefikDashboardPortEnabled` — GET /settings.haveTraefikDashboardPortEnabled
- `dokploy settings health` — GET /settings.health
- `dokploy settings isCloud` — GET /settings.isCloud
- `dokploy settings isUserSubscribed` — GET /settings.isUserSubscribed
- `dokploy settings readDirectories` — GET /settings.readDirectories
- `dokploy settings readMiddlewareTraefikConfig` — GET /settings.readMiddlewareTraefikConfig
- `dokploy settings readTraefikConfig` — GET /settings.readTraefikConfig
- `dokploy settings readTraefikEnv` — GET /settings.readTraefikEnv
- `dokploy settings readTraefikFile` — GET /settings.readTraefikFile
- `dokploy settings readWebServerTraefikConfig` — GET /settings.readWebServerTraefikConfig
- `dokploy settings reloadRedis` — POST /settings.reloadRedis
- `dokploy settings reloadServer` — POST /settings.reloadServer
- `dokploy settings reloadTraefik` — POST /settings.reloadTraefik
- `dokploy settings saveSSHPrivateKey` — POST /settings.saveSSHPrivateKey
- `dokploy settings setupGPU` — POST /settings.setupGPU
- `dokploy settings toggleDashboard` — POST /settings.toggleDashboard
- `dokploy settings toggleRequests` — POST /settings.toggleRequests
- `dokploy settings updateDockerCleanup` — POST /settings.updateDockerCleanup
- `dokploy settings updateLogCleanup` — POST /settings.updateLogCleanup
- `dokploy settings updateMiddlewareTraefikConfig` — POST /settings.updateMiddlewareTraefikConfig
- `dokploy settings updateServer` — POST /settings.updateServer
- `dokploy settings updateServerIp` — POST /settings.updateServerIp
- `dokploy settings updateTraefikConfig` — POST /settings.updateTraefikConfig
- `dokploy settings updateTraefikFile` — POST /settings.updateTraefikFile
- `dokploy settings updateTraefikPorts` — POST /settings.updateTraefikPorts
- `dokploy settings updateWebServerTraefikConfig` — POST /settings.updateWebServerTraefikConfig
- `dokploy settings writeTraefikEnv` — POST /settings.writeTraefikEnv

## sshKey (7)

- `dokploy sshKey all` — GET /sshKey.all
- `dokploy sshKey allForApps` — GET /sshKey.allForApps
- `dokploy sshKey create` — POST /sshKey.create
- `dokploy sshKey generate` — POST /sshKey.generate
- `dokploy sshKey one` — GET /sshKey.one
- `dokploy sshKey remove` — POST /sshKey.remove
- `dokploy sshKey update` — POST /sshKey.update

## sso (10)

- `dokploy sso addTrustedOrigin` — POST /sso.addTrustedOrigin
- `dokploy sso deleteProvider` — POST /sso.deleteProvider
- `dokploy sso getTrustedOrigins` — GET /sso.getTrustedOrigins
- `dokploy sso listProviders` — GET /sso.listProviders
- `dokploy sso one` — GET /sso.one
- `dokploy sso register` — POST /sso.register
- `dokploy sso removeTrustedOrigin` — POST /sso.removeTrustedOrigin
- `dokploy sso showSignInWithSSO` — GET /sso.showSignInWithSSO
- `dokploy sso update` — POST /sso.update
- `dokploy sso updateTrustedOrigin` — POST /sso.updateTrustedOrigin

## stripe (8)

- `dokploy stripe canCreateMoreServers` — GET /stripe.canCreateMoreServers
- `dokploy stripe createCheckoutSession` — POST /stripe.createCheckoutSession
- `dokploy stripe createCustomerPortalSession` — POST /stripe.createCustomerPortalSession
- `dokploy stripe getCurrentPlan` — GET /stripe.getCurrentPlan
- `dokploy stripe getInvoices` — GET /stripe.getInvoices
- `dokploy stripe getProducts` — GET /stripe.getProducts
- `dokploy stripe updateInvoiceNotifications` — POST /stripe.updateInvoiceNotifications
- `dokploy stripe upgradeSubscription` — POST /stripe.upgradeSubscription

## swarm (4)

- `dokploy swarm getContainerStats` — GET /swarm.getContainerStats
- `dokploy swarm getNodeApps` — GET /swarm.getNodeApps
- `dokploy swarm getNodeInfo` — GET /swarm.getNodeInfo
- `dokploy swarm getNodes` — GET /swarm.getNodes

## tag (8)

- `dokploy tag all` — GET /tag.all
- `dokploy tag assignToProject` — POST /tag.assignToProject
- `dokploy tag bulkAssign` — POST /tag.bulkAssign
- `dokploy tag create` — POST /tag.create
- `dokploy tag one` — GET /tag.one
- `dokploy tag remove` — POST /tag.remove
- `dokploy tag removeFromProject` — POST /tag.removeFromProject
- `dokploy tag update` — POST /tag.update

## user (23)

- `dokploy user all` — GET /user.all
- `dokploy user assignPermissions` — POST /user.assignPermissions
- `dokploy user checkUserOrganizations` — GET /user.checkUserOrganizations
- `dokploy user createApiKey` — POST /user.createApiKey
- `dokploy user createUserWithCredentials` — POST /user.createUserWithCredentials
- `dokploy user deleteApiKey` — POST /user.deleteApiKey
- `dokploy user generateToken` — POST /user.generateToken
- `dokploy user get` — GET /user.get
- `dokploy user getBackups` — GET /user.getBackups
- `dokploy user getBookmarkedTemplates` — GET /user.getBookmarkedTemplates
- `dokploy user getContainerMetrics` — GET /user.getContainerMetrics
- `dokploy user getInvitations` — GET /user.getInvitations
- `dokploy user getMetricsToken` — GET /user.getMetricsToken
- `dokploy user getPermissions` — GET /user.getPermissions
- `dokploy user getServerMetrics` — GET /user.getServerMetrics
- `dokploy user getUserByToken` — GET /user.getUserByToken
- `dokploy user haveRootAccess` — GET /user.haveRootAccess
- `dokploy user one` — GET /user.one
- `dokploy user remove` — POST /user.remove
- `dokploy user sendInvitation` — POST /user.sendInvitation
- `dokploy user session` — GET /user.session
- `dokploy user toggleTemplateBookmark` — POST /user.toggleTemplateBookmark
- `dokploy user update` — POST /user.update

## volumeBackups (6)

- `dokploy volumeBackups create` — POST /volumeBackups.create
- `dokploy volumeBackups delete` — POST /volumeBackups.delete
- `dokploy volumeBackups list` — GET /volumeBackups.list
- `dokploy volumeBackups one` — GET /volumeBackups.one
- `dokploy volumeBackups runManually` — POST /volumeBackups.runManually
- `dokploy volumeBackups update` — POST /volumeBackups.update

## whitelabeling (4)

- `dokploy whitelabeling get` — GET /whitelabeling.get
- `dokploy whitelabeling getPublic` — GET /whitelabeling.getPublic
- `dokploy whitelabeling reset` — POST /whitelabeling.reset
- `dokploy whitelabeling update` — POST /whitelabeling.update
