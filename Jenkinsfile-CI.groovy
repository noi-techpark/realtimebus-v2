pipeline {
    agent {
        dockerfile {
            filename 'docker/dockerfile-node'
            additionalBuildArgs '--build-arg JENKINS_USER_ID=`id -u jenkins` --build-arg JENKINS_GROUP_ID=`id -g jenkins`'
        }
    }

    stages {
        stage('Dependencies') {
            steps {
                sh 'npm install'
            }
        }
        /*TODO add test phase as soon as code also gets tested
        stage('Test') {
            steps {
                sh 'npm run test'
            }
        }
        */
    }
}
