pipeline {
    agent any

    environment {
        CONFIG_FILE=credentials('realtimebus_config')
        PRODUCTION_SERVER=credentials('realtimebusV2-prod-ip')
    }

    stages {
        stage('Configure') {
            steps {
                sh 'cat ${CONFIG_FILE} > local-config.js'
            }
        }
        stage('Deploy') {
            steps {
                sh 'ssh ${PRODUCTION_SERVER} [ -d foo ] || mkdir realtimebus-v2'
                sh 'scp  local-config.js ${PRODUCTION_SERVER}:realtimebus-v2/local-config.js'
                sh '''
                    ssh ${PRODUCTION_SERVER} \
                       "cd realtimebus-v2/ && git fetch --all --prune && git reset --hard origin/master && git pull && npm install && sudo systemctl restart realtimebus.service"
                  '''
            }
        }
    }
}
