param(
    [Parameter(Mandatory)]
    [uri]$BaseUrl,
    [pscredential]$Credential,
    [switch]$TestWrite
)

$ErrorActionPreference = 'Stop'
if ($BaseUrl.Scheme -notin @('http', 'https') -or
    $BaseUrl.AbsolutePath.TrimEnd('/') -notmatch '/hs/progresselectrosite$' -or
    $BaseUrl.UserInfo -or $BaseUrl.Query -or $BaseUrl.Fragment) {
    throw 'Укажи полный адрес публикации до /hs/progresselectrosite.'
}
$base = $BaseUrl.AbsoluteUri.TrimEnd('/')
Add-Type -AssemblyName System.Net.Http
$handler = [Net.Http.HttpClientHandler]::new()
$handler.AllowAutoRedirect = $false
if ($Credential) {
    # учетные данные веб-публикации отличаются от пинов сайта
    $handler.Credentials = $Credential.GetNetworkCredential()
    $handler.PreAuthenticate = $true
}
$client = [Net.Http.HttpClient]::new($handler)
$client.Timeout = [TimeSpan]::FromSeconds(30)

# отправляет запрос в указанную публикацию и сохраняет статус даже при отказе
function Invoke-Service($Method, $Route, $UserCode, $Payload) {
    $request = [Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::new($Method), "$base/$Route")
    try {
        if ($UserCode) { $request.Headers.Add('X-User-Code', $UserCode) }
        if ($null -ne $Payload) {
            $json = ConvertTo-Json -InputObject $Payload -Depth 8 -Compress
            $request.Content = [Net.Http.StringContent]::new($json, [Text.Encoding]::UTF8, 'application/json')
        }
        $response = $client.SendAsync($request).GetAwaiter().GetResult()
        try {
            $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
            $data = $null
            if ($body -and $response.Content.Headers.ContentType.MediaType -eq 'application/json') {
                $data = ConvertFrom-Json -InputObject $body
            }
            return [pscustomobject]@{ Status = [int]$response.StatusCode; Data = $data; Body = $body }
        } finally { $response.Dispose() }
    } finally { $request.Dispose() }
}

# останавливает проверку при первом неожиданном ответе
function Confirm-Result($Condition, $Message) {
    if (-not $Condition) { throw $Message }
}

# запрашивает пин без показа в консоли
function Read-TestLogin($Label) {
    $secret = Read-Host $Label -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    try {
        $pin = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
        $reply = Invoke-Service 'POST' 'login' $null @{ pin = $pin }
        Confirm-Result ($reply.Status -eq 200 -and $reply.Data.Code -and [string]$reply.Data.Code -ne '0') "Вход не прошёл, HTTP $($reply.Status)."
        return $reply.Data
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
        $secret.Dispose()
    }
}

try {
    foreach ($route in @('login', 'goods', 'customer-order')) {
        $reply = Invoke-Service 'OPTIONS' $route
        if ($reply.Status -eq 401) {
            throw "Публикация вернула HTTP 401 для /$route. Проверь учётные данные 1С и передай их через -Credential."
        }
        Confirm-Result ($reply.Status -in @(200, 204)) "OPTIONS /$route вернул HTTP $($reply.Status). Проверь публикацию и маршрут."
        Write-Host "OK OPTIONS /$route"
    }
    $first = Read-TestLogin 'ПИН первого тестового пользователя'
    $second = Read-TestLogin 'ПИН второго тестового пользователя'
    Confirm-Result ($first.Code -ne $second.Code) 'Для проверки нужны два разных пользователя.'
    Write-Host "OK вход двух пользователей"

    $code = (Read-Host 'Код товара с известной ценой и остатком').Trim()
    $codePart = (Read-Host 'Часть числового кода товара').Trim()
    $namePart = (Read-Host 'Часть названия этого товара').Trim()
    $barcode = (Read-Host 'Штрихкод этого товара').Trim()
    Confirm-Result ($code -and $codePart -match '^\d+$' -and $namePart -and $barcode) 'Заполни все поля тестового товара.'
    foreach ($query in @(@{ Key = 'q'; Value = $namePart }, @{ Key = 'q'; Value = $codePart }, @{ Key = 'barcode'; Value = $barcode })) {
        $value = [uri]::EscapeDataString($query.Value)
        $reply = Invoke-Service 'GET' ('goods?' + $query.Key + '=' + $value) $first.Code
        $found = @($reply.Data.items | Where-Object { [string]$_.code -eq $code })
        Confirm-Result ($reply.Status -eq 200 -and $found.Count -eq 1) "Поиск $($query.Key) не вернул товар $code, HTTP $($reply.Status)."
        Write-Host "OK поиск $($query.Key)"
    }
    foreach ($account in @($first, $second)) {
        $reply = Invoke-Service 'GET' ('customer-order?q=' + [uri]::EscapeDataString($code)) $account.Code
        Confirm-Result ($reply.Status -eq 200) "Подбор отгрузки вернул HTTP $($reply.Status). $($reply.Data.error)"
        if ($account.Code -eq $first.Code) { $selection = $reply.Data.items }
    }
    $rows = @($selection | Where-Object { [string]$_.Code -eq $code })
    Confirm-Result ($rows.Count -eq 1) "В подборе нужна одна строка товара $code."
    $item = $rows[0]
    $available = [decimal]$item.quantity
    $price = [decimal]$item.price
    Write-Host "Товар $($item.Name), остаток $available, цена $price. Сверь их с 1С."

    if (-not $TestWrite) { return }
    Confirm-Result ($available -ge 1.25 -and $available -lt 999999998 -and $price -gt 0) 'Для теста выбери товар с ценой больше нуля и остатком от 1,25.'
    Write-Host "Публикация $base"
    Confirm-Result ((Read-Host 'Сверь цену и остаток. Для записи на копии базы введи КОПИЯ') -ceq 'КОПИЯ') 'Запись отменена.'
    $payload = @{
        point_id = '0'
        technician_id = [string]$first.Code
        items = @(@{ code = $code; name = $item.Name; qty = 1.25; price = $price })
    }

    $created = Invoke-Service 'POST' 'customer-order' $first.Code $payload
    Confirm-Result ($created.Status -eq 200 -and $created.Data.ok -eq $true -and $created.Data.doc_number -and $created.Data.document_type -eq 'customer_order') "Создание заказа не подтверждено. HTTP $($created.Status). $($created.Data.error)"
    Write-Host "OK создан заказ $($created.Data.doc_number)"
    $after = Invoke-Service 'GET' ('customer-order?q=' + [uri]::EscapeDataString($code)) $first.Code
    Confirm-Result ($after.Status -eq 200) 'Не удалось перечитать остаток.'
    $remaining = @($after.Data.items | Where-Object { [string]$_.Code -eq $code })
    $remainingQty = if ($remaining.Count) { [decimal]$remaining[0].quantity } else { 0 }
    Confirm-Result ($remaining.Count -le 1 -and $remainingQty -eq $available) 'При записи заказа изменился остаток. Проверь движения и параллельные операции.'
    Write-Host 'OK остаток не изменился после записи заказа'
    $payload.items[0].qty = $remainingQty + 1
    $overstock = Invoke-Service 'POST' 'customer-order' $first.Code $payload
    Confirm-Result ($overstock.Status -eq 400 -and $overstock.Data.error -like '*Недостатній залишок*') "Сервер не подтвердил отказ по остатку. HTTP $($overstock.Status)."
    Write-Host "В заказе $($created.Data.doc_number) проверь магазин, организацию, точку и контрагента."
} finally { $client.Dispose() }
