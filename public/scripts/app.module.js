(function () {
    'use strict'

    function FestiveController ($scope, $http, $interval) {
        $interval(function cheerLightsMonitor () {
            $http({
                method : 'GET',
                url : 'http://api.thingspeak.com/channels/1417/field/2/last.json'
            }).then(function success (response) {
                $scope.treeStyle = { color: response.data.field2 };
            });
        }, 10 * 1000);

        $scope.detectScrooge = function detectScrooge () {
            var requestText = $scope.festiveText;

            if($scope.festiveText){
                $http({
                    method : 'POST',
                    headers: {'Content-Type': 'text/plain'},
                    url : 'http://festometer.mybluemix.net/api/yule-logs/',
                    data : requestText
                }).then(function success (response) {
                    $scope.yuleLogs.unshift(response.data)
                }, function fail (error) {
                    $scope.yuleLogs.unshift('"' + requestText + '" (Unknown)');
                    console.log(error)
                });
                $scope.festiveText = null
            }
        };

        $scope.yuleLogs = [ ];

        $scope.treeStyle = { color: '#008000' };
    }

    angular
        .module('app', [])
        .controller('FestiveController', ['$scope', '$http', '$interval', FestiveController]);

})();


