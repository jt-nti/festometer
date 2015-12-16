(function () {
    'use strict'

    function FestiveController ($scope, $http) {
        $scope.detectScrooge = function detectScrooge () {
            var requestText = $scope.festiveText;

            if($scope.festiveText){
                $http({
                    method : 'POST',
                    headers: {'Content-Type': 'text/plain'},
                    url : '/api/yuleLogs',
                    data : requestText
                }).then(function success (response) {
                    $scope.yuleLogs.unshift(response)
                }, function fail (error) {
                    $scope.yuleLogs.unshift('"' + requestText + '" (Unknown)');
                    console.log(error)
                });
                $scope.festiveText = null
            }
        };

        $scope.yuleLogs = [ ];
    }

    angular
        .module('app', [])
        .controller('FestiveController', FestiveController);

})();


