pipeline {
    agent any

    environment {
        CONFIG_FILE=credentials('realtimebus_config')
        PRODUCTION_SERVER=credentials('realtimebusV2-prod-ip')
    }

    stages {
        stage('Deploy') {
            steps {
                sh '''
                    ssh ${PRODUCTION_SERVER} \
                       "cd realtimebus-v2/ && git fetch --all --prune && git reset --hard origin/master && git pull && npm install && cat ${CONFIG_FILE} > local-config.js"
                  '''
            }
        }
    }
}
